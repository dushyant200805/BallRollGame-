// Ball Roll — one level attempt: moves, undo, timer, rolling, win/lose rules, extra moves.
// Port of js/core/session.js.
using System;
using System.Collections.Generic;

namespace BallRoll.Core
{
    public enum SessionState { Playing, Paused, Rolling, Won, Lost }
    public enum RollOutcome { None, Won, Lost, Retry }

    /// <summary>Level definition (rows + par + stored optimal solution).</summary>
    public sealed class LevelDef
    {
        public string Id;
        public int Number; // 1-based within its mode (0 for the Daily)
        public int Size;
        public int Par;
        public string[] Rows;
        public List<Move> Solution = new List<Move>();
    }

    [Serializable]
    public sealed class SessionSnapshot
    {
        public string[] rows;
        public int moves;
        public float elapsed;
        public List<Move> history = new List<Move>();
        public int hintsUsed;
        public int bonusMoves;
    }

    public sealed class GameSession
    {
        public readonly LevelDef Level;
        public readonly string Mode;
        public int MoveLimit;   // 0 = unlimited (raised by Extra Moves)
        public int BonusMoves;  // extra moves added from rewards (kept on restart)
        public readonly float TimeLimit; // seconds, 0 = none
        public readonly Board Initial;

        public Board Board { get; private set; }
        public int Moves { get; private set; }
        public readonly List<Move> History = new List<Move>();
        public float Elapsed;
        public int HintsUsed { get; private set; }
        public SessionState State { get; private set; }
        public string LostReason { get; private set; } // "time" | "moves" | null

        TraceResult trace;

        public GameSession(LevelDef level, string mode = "classic", int moveLimit = 0, float timeLimit = 0)
        {
            Level = level;
            Mode = mode;
            MoveLimit = moveLimit;
            TimeLimit = timeLimit;
            Initial = Board.FromRows(level.Rows);
            Restart();
        }

        public void Restart()
        {
            Board = Initial.Clone();
            Moves = 0;
            History.Clear();
            Elapsed = 0;
            HintsUsed = 0;
            State = SessionState.Playing;
            LostReason = null;
            trace = null;
        }

        public TraceResult Connection => trace ??= Pathfinding.Trace(Board);

        public int MovesLeft => MoveLimit > 0 ? Math.Max(0, MoveLimit - Moves) : int.MaxValue;
        public float TimeLeft => TimeLimit > 0 ? Math.Max(0, TimeLimit - Elapsed) : float.MaxValue;
        public bool CanInteract => State == SessionState.Playing;

        /// <summary>Extra moves from rewards: raises the limit and revives an out-of-moves loss.</summary>
        public bool AddMoves(int n)
        {
            if (MoveLimit <= 0 || n <= 0) return false;
            MoveLimit += n;
            BonusMoves += n;
            if (State == SessionState.Lost && LostReason == "moves")
            {
                State = SessionState.Playing;
                LostReason = null;
            }
            return true;
        }

        /// <summary>Try a slide. reason: "state" | "limit" | "illegal" when it fails.</summary>
        public bool TryMove(int x, int y, int dir, out Move move, out string reason)
        {
            move = default;
            reason = null;
            if (!CanInteract) { reason = "state"; return false; }
            if (MoveLimit > 0 && Moves >= MoveLimit) { reason = "limit"; return false; }
            if (!Board.TryMove(x, y, dir, out move)) { reason = "illegal"; return false; }
            History.Add(move);
            Moves++;
            trace = null;
            return true;
        }

        /// <summary>Reverts the last slide; returns the reverse move (for animation).</summary>
        public bool Undo(out Move back)
        {
            back = default;
            if (!CanInteract || History.Count == 0) return false;
            var m = History[History.Count - 1];
            History.RemoveAt(History.Count - 1);
            Board.TryMove(m.ToX, m.ToY, Dir.Opposite(m.Dir), out back);
            Moves = Math.Max(0, Moves - 1);
            trace = null;
            return true;
        }

        public void Pause() { if (State == SessionState.Playing) State = SessionState.Paused; }
        public void Resume() { if (State == SessionState.Paused) State = SessionState.Playing; }

        /// <summary>Advance the clock; returns true when a time limit runs out.</summary>
        public bool Tick(float dt)
        {
            if (State != SessionState.Playing) return false;
            Elapsed += dt;
            if (TimeLimit > 0 && Elapsed >= TimeLimit)
            {
                Elapsed = TimeLimit;
                State = SessionState.Lost;
                LostReason = "time";
                return true;
            }
            return false;
        }

        public TraceResult StartRoll()
        {
            if (!CanInteract) return null;
            State = SessionState.Rolling;
            return Connection;
        }

        public RollOutcome FinishRoll(bool ok)
        {
            if (State != SessionState.Rolling) return RollOutcome.None;
            if (ok) { State = SessionState.Won; return RollOutcome.Won; }
            if (MoveLimit > 0 && Moves >= MoveLimit)
            {
                State = SessionState.Lost;
                LostReason = "moves";
                return RollOutcome.Lost;
            }
            State = SessionState.Playing;
            return RollOutcome.Retry;
        }

        /// <summary>Next best move, or null if none within budget. solved = already connected.</summary>
        public Move? Hint(out bool solved, out int remaining, int maxNodes = 200000)
        {
            HintsUsed++;
            solved = false;
            remaining = 0;
            var res = Pathfinding.Solve(Board, maxNodes);
            if (res.Moves == null) return null;
            if (res.Moves.Count == 0) { solved = true; return null; }
            remaining = res.Moves.Count;
            return res.Moves[0];
        }

        public int Stars()
        {
            if (State != SessionState.Won) return 0;
            if (Mode == "timetrial" && TimeLimit > 0)
            {
                float frac = TimeLeft / TimeLimit;
                return frac >= 0.5f ? 3 : frac >= 0.25f ? 2 : 1;
            }
            int par = Math.Max(1, Level.Par);
            if (Moves <= par) return 3;
            if (Moves <= par + Math.Max(2, (int)Math.Ceiling(par * 0.5))) return 2;
            return 1;
        }

        public SessionSnapshot Snapshot() => new SessionSnapshot
        {
            rows = Board.ToRows(), moves = Moves, elapsed = Elapsed,
            history = new List<Move>(History), hintsUsed = HintsUsed, bonusMoves = BonusMoves,
        };

        public bool Restore(SessionSnapshot snap)
        {
            try
            {
                if (snap == null || snap.rows == null) return false;
                var b = Board.FromRows(snap.rows);
                if (b.W != Initial.W || b.H != Initial.H) return false;
                Board = b;
                Moves = snap.moves;
                Elapsed = snap.elapsed;
                History.Clear();
                if (snap.history != null) History.AddRange(snap.history);
                HintsUsed = snap.hintsUsed;
                if (MoveLimit > 0 && snap.bonusMoves > BonusMoves)
                {
                    MoveLimit += snap.bonusMoves - BonusMoves;
                    BonusMoves = snap.bonusMoves;
                }
                State = SessionState.Playing;
                trace = null;
                return true;
            }
            catch (FormatException) { return false; }
        }
    }
}
