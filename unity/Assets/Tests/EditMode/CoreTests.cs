// Ball Roll — EditMode tests for the C# port of the game rules (ported from tools/test-core.js
// and mobile/scripts/run-tests.js). Run: Unity -batchmode -runTests -testPlatform EditMode
using System;
using System.Collections.Generic;
using BallRoll.Core;
using NUnit.Framework;

namespace BallRoll.Tests
{
    public class CoreTests
    {
        static readonly LevelDef Tiny = new LevelDef { Id = "t", Size = 3, Par = 1, Rows = new[] { "Se . Ew", "o - o", "o o o" } };

        [Test]
        public void TokensRoundTrip()
        {
            var b = Board.FromRows(Tiny.Rows);
            CollectionAssert.AreEqual(Tiny.Rows, b.ToRows());
        }

        [Test]
        public void RejectsBoardsWithoutStartOrEnd()
        {
            Assert.Throws<FormatException>(() => Board.FromRows(new[] { "o . o", "o o o" }));
        }

        [Test]
        public void MovesSlideIntoEmptyOnly()
        {
            var b = Board.FromRows(Tiny.Rows);
            Assert.IsFalse(b.CanMove(0, 0, Dir.E), "start is fixed");
            Assert.IsFalse(b.TryMove(0, 1, Dir.N, out _), "target cell is the start tile");
            Assert.IsTrue(b.TryMove(1, 1, Dir.N, out var m));
            Assert.AreEqual(1, m.ToX);
            Assert.AreEqual(0, m.ToY);
        }

        [Test]
        public void TraceAndSolveTinyBoard()
        {
            var b = Board.FromRows(Tiny.Rows);
            var t = Pathfinding.Trace(b);
            Assert.IsFalse(t.Ok);
            Assert.AreEqual(FailReason.Gap, t.Fail);
            var res = Pathfinding.Solve(b);
            Assert.AreEqual(1, res.Moves.Count);
            Assert.IsTrue(b.TryMove(res.Moves[0].X, res.Moves[0].Y, res.Moves[0].Dir, out _));
            Assert.IsTrue(Pathfinding.Trace(b).Ok);
        }

        [Test]
        public void RngMatchesJavaScript()
        {
            // values from js/core/rng.js: createRng('abc').next() x3
            var r = new Rng("abc");
            Assert.AreEqual(440920331u, Rng.HashString("abc"));
            Assert.AreEqual(0.5166419988963753, r.Next(), 1e-15);
            Assert.AreEqual(0.6596221292857081, r.Next(), 1e-15);
            Assert.AreEqual(0.0018796597141772509, r.Next(), 1e-15);
        }

        [Test]
        public void SessionWinLoseAndExtraMoves()
        {
            var s = new GameSession(Tiny, "challenge", moveLimit: 1);
            Assert.AreEqual(RollOutcome.Retry, Fin(s, false));
            Assert.IsTrue(s.TryMove(1, 1, Dir.N, out _, out _));
            Assert.IsFalse(s.TryMove(1, 0, Dir.S, out _, out var why));
            Assert.AreEqual("limit", why);
            Assert.AreEqual(RollOutcome.Won, Fin(s, s.Connection.Ok));
            Assert.AreEqual(3, s.Stars());

            var lost = new GameSession(Tiny, "challenge", moveLimit: 1);
            Assert.IsTrue(lost.TryMove(1, 1, Dir.N, out _, out _));
            Assert.AreEqual(RollOutcome.Lost, Fin(lost, false), "a failed roll with no moves left loses");
            Assert.IsTrue(lost.AddMoves(3));
            Assert.AreEqual(SessionState.Playing, lost.State);
            Assert.AreEqual(3, lost.MovesLeft);
            var t = new GameSession(Tiny, "challenge", moveLimit: 1);
            t.Restore(lost.Snapshot());
            Assert.AreEqual(4, t.MoveLimit, "extra moves survive save/restore");
        }

        static RollOutcome Fin(GameSession s, bool ok) { s.StartRoll(); return s.FinishRoll(ok); }

        [Test]
        public void TimeLimitAndPause()
        {
            var s = new GameSession(Tiny, "timetrial", timeLimit: 2);
            s.Pause();
            Assert.IsFalse(s.Tick(5));
            s.Resume();
            Assert.IsTrue(s.Tick(3));
            Assert.AreEqual("time", s.LostReason);
        }
    }

    public class LevelTests
    {
        [Test]
        public void SixtyLevelsMigrated()
        {
            foreach (var mode in GameData.ModeIds) Assert.AreEqual(20, GameData.Count(mode), mode);
        }

        [Test]
        public void EveryLevelUnsolvedAtStartParProvenAndSolutionWins()
        {
            foreach (var mode in GameData.ModeIds)
                for (int n = 1; n <= GameData.Count(mode); n++)
                {
                    var lv = GameData.Level(mode, n);
                    string name = mode + " " + n;
                    var board = Board.FromRows(lv.Rows);
                    Assert.IsFalse(Pathfinding.Trace(board).Ok, name + " starts solved");
                    var res = Pathfinding.Solve(board, 4000000);
                    Assert.IsNotNull(res.Moves, name + " unsolvable");
                    Assert.AreEqual(lv.Par, res.Moves.Count, name + " par");
                    LevelRules.LimitsFor(mode, lv, GameData.Count(mode), out int ml, out float tl);
                    var s = new GameSession(lv, mode, ml, tl);
                    foreach (var m in lv.Solution) Assert.IsTrue(s.TryMove(m.X, m.Y, m.Dir, out _, out var why), name + " illegal stored move: " + why);
                    Assert.IsTrue(s.Connection.Ok, name + " solution connects");
                    s.StartRoll();
                    Assert.AreEqual(RollOutcome.Won, s.FinishRoll(true));
                    Assert.AreEqual(3, s.Stars(), name + " stars");
                }
        }

        [Test]
        public void ChallengeLimitsTighten()
        {
            var c1 = GameData.Level("challenge", 1);
            LevelRules.LimitsFor("challenge", c1, 20, out int ml1, out _);
            Assert.Greater(ml1, c1.Par);
            LevelRules.LimitsFor("timetrial", GameData.Level("timetrial", 20), 20, out _, out float tl);
            Assert.Greater(tl, 0);
        }

        [Test]
        public void DailyPuzzleMatchesTheJavaScriptGenerator()
        {
            foreach (var day in GameData.DailyExpected().days)
            {
                var lv = LevelRules.Daily(day.key);
                Assert.IsNotNull(lv, day.key);
                CollectionAssert.AreEqual(day.rows, lv.Rows, day.key + " rows");
                Assert.AreEqual(day.par, lv.Par, day.key + " par");
            }
        }
    }

    public class RewardTests
    {
        static RewardEnv Env(int stars = 0) => new RewardEnv { Cfg = GameData.Rewards, Skins = GameData.SkinCosts(), Stars = stars };

        [Test]
        public void GiftsNeverRepeatACosmetic()
        {
            var cfg = GameData.Rewards;
            var st = Rewards.DefaultState(cfg);
            var env = Env();
            var rnd = new System.Random(7);
            for (int i = 0; i < 400; i++)
            {
                var r = Rewards.PickReward(i % 2 == 0 ? "milestone" : "daily", st, env, rnd.NextDouble);
                Assert.IsNotNull(Rewards.Grant(r, "milestone", st, env, 1), "duplicate " + r?.Type + " " + r?.Item);
            }
            Assert.AreEqual(new HashSet<string>(st.balls).Count, st.balls.Count);
            Assert.AreEqual(cfg.themes.Count - 1, st.themes.Count);
            Assert.AreEqual(cfg.historyLimit, st.history.Count);
        }

        [Test]
        public void DailyCostsDoubleAndResetNextDayButNotWhenClockGoesBack()
        {
            var cfg = GameData.Rewards;
            var st = Rewards.DefaultState(cfg);
            Assert.AreEqual(DailyKind.Ad, Rewards.NextDaily(st, cfg, "2026-11-19").Kind);
            var costs = new List<int>();
            for (int i = 1; i <= 4; i++) { st.day.count = i; costs.Add(Rewards.NextDaily(st, cfg, "2026-11-19").Cost); }
            CollectionAssert.AreEqual(new[] { 25, 50, 100, 200 }, costs);
            Assert.AreEqual(4, Rewards.NextDaily(st, cfg, "2026-11-01").Opened, "clock moved back");
            Assert.AreEqual(DailyKind.Ad, Rewards.NextDaily(st, cfg, "2026-11-20").Kind);
        }

        [Test]
        public void MilestoneEveryTenLevels()
        {
            var cfg = GameData.Rewards;
            var st = Rewards.DefaultState(cfg);
            Assert.AreEqual(0, Rewards.Milestone(st, cfg, 9).Available);
            Assert.AreEqual(2, Rewards.Milestone(st, cfg, 21).Available);
            st.milestonesClaimed = 2;
            Assert.AreEqual(1, Rewards.Milestone(st, cfg, 21).Progress);
        }

        [Test]
        public void BallShopAndCoinAds()
        {
            var cfg = GameData.Rewards;
            var st = Rewards.DefaultState(cfg);
            var env = Env();
            for (int i = 0; i < cfg.shop.adsPerDay + 1; i++) Rewards.GrantAdCoins(st, cfg, "d1", 1);
            Assert.AreEqual(cfg.shop.adsPerDay * cfg.shop.adCoins, st.coins);
            var black = env.Skins.Find(k => k.Id == "black");
            int price = Rewards.BallPrice(cfg, black);
            Assert.IsNull(Rewards.BuyBall(st, env, "black", price + 1, 1, out var why));
            Assert.AreEqual("state", why);
            Assert.IsNotNull(Rewards.BuyBall(st, env, "black", price, 1, out _));
            Assert.IsNull(Rewards.BuyBall(st, env, "black", price, 1, out why));
            Assert.AreEqual("owned", why);
        }
    }
}
