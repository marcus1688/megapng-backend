const express = require("express");
const router = express.Router();
const cron = require("node-cron");
const moment = require("moment-timezone");
const LoyaltyBonus = require("../models/loyaltybonus.model");
const { adminUser } = require("../models/adminuser.model");
const Deposit = require("../models/deposit.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { User } = require("../models/users.model");
const TIMEZONE = "Asia/Kuala_Lumpur";

const LOYALTY_TIERS = [
  { min: 50000, max: Infinity, tier: "tier4", bonus: 588 },
  { min: 25000, max: 49999, tier: "tier3", bonus: 388 },
  { min: 5000, max: 24999, tier: "tier2", bonus: 88 },
  { min: 1000, max: 4999, tier: "tier1", bonus: 28 },
  { min: 0, max: 999, tier: "none", bonus: 0 },
];

const getTierInfo = (totalDeposit) => {
  for (const tier of LOYALTY_TIERS) {
    if (totalDeposit >= tier.min && totalDeposit <= tier.max) {
      return { tier: tier.tier, bonus: tier.bonus };
    }
  }
  return { tier: "none", bonus: 0 };
};

const runLoyaltyBonusCalculation = async (isManual = false) => {
  try {
    const now = moment.tz(TIMEZONE);
    const currentDay = now.date();
    let periodStart, periodEnd, periodType;
    if (currentDay === 16 || isManual) {
      if (currentDay >= 16) {
        periodStart = moment.tz(TIMEZONE).startOf("month").toDate();
        periodEnd = moment.tz(TIMEZONE).date(15).endOf("day").toDate();
        periodType = "first_half";
      } else {
        periodStart = moment
          .tz(TIMEZONE)
          .subtract(1, "month")
          .date(16)
          .startOf("day")
          .toDate();
        periodEnd = moment
          .tz(TIMEZONE)
          .subtract(1, "month")
          .endOf("month")
          .toDate();
        periodType = "second_half";
      }
    } else if (currentDay === 1) {
      periodStart = moment
        .tz(TIMEZONE)
        .subtract(1, "month")
        .date(16)
        .startOf("day")
        .toDate();
      periodEnd = moment
        .tz(TIMEZONE)
        .subtract(1, "month")
        .endOf("month")
        .toDate();
      periodType = "second_half";
    } else if (isManual) {
      if (currentDay <= 15) {
        periodStart = moment
          .tz(TIMEZONE)
          .subtract(1, "month")
          .date(16)
          .startOf("day")
          .toDate();
        periodEnd = moment
          .tz(TIMEZONE)
          .subtract(1, "month")
          .endOf("month")
          .toDate();
        periodType = "second_half";
      } else {
        periodStart = moment.tz(TIMEZONE).startOf("month").toDate();
        periodEnd = moment.tz(TIMEZONE).date(15).endOf("day").toDate();
        periodType = "first_half";
      }
    } else {
      console.log("Not a calculation day, skipping...");
      return { success: false, message: "Not a calculation day" };
    }
    const periodLabel = `${moment
      .tz(periodStart, TIMEZONE)
      .format("DD-MM-YYYY")} ~ ${moment
      .tz(periodEnd, TIMEZONE)
      .format("DD-MM-YYYY")}`;
    console.log(`[Loyalty Bonus] Calculating for period: ${periodLabel}`);
    const depositAggregation = await Deposit.aggregate([
      {
        $match: {
          status: "approved",
          reverted: false,
          createdAt: { $gte: periodStart, $lte: periodEnd },
        },
      },
      {
        $group: {
          _id: "$username",
          totalDeposit: { $sum: "$amount" },
          userId: { $first: "$userId" },
        },
      },
    ]);
    console.log(
      `[Loyalty Bonus] Found ${depositAggregation.length} users with deposits`
    );
    let createdCount = 0;
    let skippedCount = 0;
    for (const userDeposit of depositAggregation) {
      const { _id: username, totalDeposit, userId } = userDeposit;
      const existingRecord = await LoyaltyBonus.findOne({
        username,
        periodStart,
      });
      if (existingRecord) {
        skippedCount++;
        continue;
      }
      const user = await User.findById(userId);
      const tierInfo = getTierInfo(totalDeposit);
      await LoyaltyBonus.create({
        userId,
        userid: user?.userid || "",
        username,
        periodStart,
        periodEnd,
        periodLabel,
        periodType,
        totalDeposit,
        tier: tierInfo.tier,
        bonusPoints: tierInfo.bonus,
        claimed: false,
      });
      createdCount++;
    }
    console.log(
      `[Loyalty Bonus] Created: ${createdCount}, Skipped: ${skippedCount}`
    );
    return {
      success: true,
      message: {
        en: `Loyalty bonus calculated. Created: ${createdCount}, Skipped: ${skippedCount}`,
        zh: `忠实奖金已计算。创建: ${createdCount}, 跳过: ${skippedCount}`,
      },
      data: { createdCount, skippedCount, periodLabel },
    };
  } catch (error) {
    console.error("[Loyalty Bonus] Calculation error:", error);
    return {
      success: false,
      message: { en: "Calculation failed", zh: "计算失败" },
      error: error.message,
    };
  }
};

// 每个月 1号和16号 12:30am Loyalty Bonus
if (process.env.NODE_ENV !== "development") {
  cron.schedule(
    "30 0 1,16 * *",
    async () => {
      console.log(
        `[Loyalty Bonus Cron] Running at ${moment
          .tz(TIMEZONE)
          .format("YYYY-MM-DD HH:mm:ss")}`
      );
      await runLoyaltyBonusCalculation();
    },
    {
      timezone: TIMEZONE,
    }
  );
}

// GET - Fetch loyalty bonus records
router.get(
  "/admin/api/loyalty-bonus",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate, username, tier } = req.query;
      const filter = {};

      if (startDate && endDate) {
        filter.periodStart = {
          $gte: moment
            .tz(new Date(startDate), TIMEZONE)
            .startOf("day")
            .toDate(),
          $lte: moment.tz(new Date(endDate), TIMEZONE).endOf("day").toDate(),
        };
      }

      if (username) {
        filter.username = new RegExp(username, "i");
      }

      if (tier && tier !== "all") {
        filter.tier = tier;
      }

      const records = await LoyaltyBonus.find(filter).sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: records,
      });
    } catch (error) {
      console.error("Error fetching loyalty bonus report:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to fetch loyalty bonus report",
          zh: "获取忠实奖金报告失败",
        },
      });
    }
  }
);

// Admin Claim Loyalty Bonus
router.post(
  "/admin/api/loyalty-bonus/claim",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { loyaltyBonusId } = req.body;
      const adminUserId = req.user.userId;
      const admin = await adminUser.findById(adminUserId);

      const record = await LoyaltyBonus.findById(loyaltyBonusId);

      if (!record) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Record not found",
            zh: "记录不存在",
          },
        });
      }

      if (record.claimed) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus already claimed",
            zh: "奖金已领取",
          },
        });
      }

      if (record.bonusPoints === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No bonus to claim (deposit below minimum)",
            zh: "没有可领取的奖金（存款低于最低要求）",
          },
        });
      }

      record.claimed = true;
      record.claimedBy = admin.username;
      record.claimedAt = moment.tz(TIMEZONE).toDate();
      await record.save();

      res.status(200).json({
        success: true,
        message: {
          en: `Claimed ${record.bonusPoints} points for ${record.username}`,
          zh: `已为 ${record.username} 领取 ${record.bonusPoints} 积分`,
        },
      });
    } catch (error) {
      console.error("Error claiming loyalty bonus:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to claim loyalty bonus",
          zh: "领取忠实奖金失败",
        },
      });
    }
  }
);
// Admin Manual run
router.post(
  "/admin/api/loyalty-bonus/manual-run",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const result = await runLoyaltyBonusCalculation(true);
      res.status(200).json(result);
    } catch (error) {
      console.error("Error in manual loyalty bonus run:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Manual run failed",
          zh: "手动运行失败",
        },
      });
    }
  }
);

// Admin Get Tier configuration (for frontend reference)
router.get(
  "/admin/api/loyalty-bonus/tiers",
  authenticateAdminToken,
  async (req, res) => {
    res.status(200).json({
      success: true,
      data: LOYALTY_TIERS,
    });
  }
);

module.exports = router;
