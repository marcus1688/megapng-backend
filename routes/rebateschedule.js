const express = require("express");
const router = express.Router();
const schedule = require("node-schedule");
const { RebateSchedule } = require("../models/rebateSchedule.model");
const { RebateLog } = require("../models/rebate.model");
const Deposit = require("../models/deposit.model");
const Withdraw = require("../models/withdraw.model");
const Bonus = require("../models/bonus.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { User, UserGameData } = require("../models/users.model");
const vip = require("../models/vip.model");
const UserWalletLog = require("../models/userwalletlog.model");
const { getYesterdayGameLogs } = require("../services/gameData");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const axios = require("axios");
const cron = require("node-cron");
const { adminUser, adminLog } = require("../models/adminuser.model");
const Promotion = require("../models/promotion.model");
const { v4: uuidv4 } = require("uuid");

const moment = require("moment-timezone");
const TIMEZONE = "Pacific/Port_Moresby";
function getNextRunTime(hour, minute) {
  const now = moment().tz(TIMEZONE);
  const nextRun = moment().tz(TIMEZONE).hour(hour).minute(minute).second(0);
  if (nextRun.isBefore(now)) {
    nextRun.add(1, "day");
  }
  return nextRun.format("YYYY-MM-DD HH:mm:ss");
}

// 每天12am Rebate
if (process.env.NODE_ENV !== "development") {
  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log(
        `Starting rebate calculation at: ${new Date().toISOString()}`
      );
      try {
        await runRebateCalculation();
        await RebateSchedule.findOneAndUpdate({}, { lastRunTime: new Date() });
        console.log(
          `Rebate calculation completed successfully at: ${new Date().toISOString()}`
        );
      } catch (error) {
        console.error(
          `Rebate calculation error at ${new Date().toISOString()}:`,
          error
        );
      }
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  );
  console.log(
    `Rebate calculation job scheduled for 12:00 AM (${TIMEZONE}). Next run: ${getNextRunTime(
      0,
      0
    )}`
  );
}

// Admin Get Rebate Report
router.get(
  "/admin/api/rebate-report",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const dateFilter = {};

      if (startDate && endDate) {
        dateFilter.rebateissuesdate = {
          $gte: moment
            .tz(new Date(startDate), TIMEZONE)
            .startOf("day")
            .toDate(),
          $lte: moment.tz(new Date(endDate), TIMEZONE).endOf("day").toDate(),
        };
      }

      const rebateLogs = await RebateLog.find(dateFilter).sort({
        createdAt: -1,
      });

      res.json({
        success: true,
        data: rebateLogs,
      });
    } catch (error) {
      console.error("Error fetching rebate report:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch rebate report",
        error: error.message,
      });
    }
  }
);

// Admin Get Rebate Schedule
router.get(
  "/admin/api/rebate-schedule",
  authenticateAdminToken,
  async (req, res) => {
    try {
      let schedule = await RebateSchedule.findOne();
      if (!schedule) {
        schedule = await RebateSchedule.create({
          hour: 3,
          minute: 0,
          isActive: true,
          calculationType: "turnover",
          winLosePercentage: 0,
          categoryPercentages: {
            liveCasino: 0,
            sports: 0,
            slotGames: 0,
            fishing: 0,
            poker: 0,
            mahjong: 0,
            eSports: 0,
            horse: 0,
            lottery: 0,
          },
        });
      }
      res.json({ success: true, data: schedule });
    } catch (error) {
      console.error("Error fetching rebate schedule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch rebate schedule",
        error: error.message,
      });
    }
  }
);

// Admin Create Rebate-Schedule
router.post(
  "/admin/api/rebate-schedule",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const {
        hour,
        minute,
        isActive,
        calculationType,
        winLosePercentage,
        categoryPercentages,
      } = req.body;
      let schedule = await RebateSchedule.findOne();
      if (!schedule) {
        schedule = new RebateSchedule();
      }

      schedule.hour = hour;
      schedule.minute = minute;
      schedule.isActive = isActive;
      schedule.calculationType = calculationType;

      if (calculationType === "winlose") {
        schedule.winLosePercentage = winLosePercentage;
      } else {
        schedule.categoryPercentages = categoryPercentages;
      }

      await schedule.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Rebate schedule updated successfully",
          zh: "返水计划更新成功",
        },
        data: schedule,
      });
    } catch (error) {
      console.error("Error updating rebate schedule:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Manual Action Route (If Needed)
// router.post(
//   "/admin/api/rebate-calculate/manual",
//   // authenticateAdminToken,
//   async (req, res) => {
//     try {
//       await runRebateCalculation();
//       res.json({
//         success: true,
//         message: "Rebate calculation completed",
//       });
//     } catch (error) {
//       console.error("Error running manual rebate calculation:", error);
//       res.status(500).json({
//         success: false,
//         message: "Failed to run rebate calculation",
//         error: error.message,
//       });
//     }
//   }
// );

// Admin Claim Rebate for User
router.post(
  "/admin/api/claim-rebate",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { rebateLogId } = req.body;
      const adminUserId = req.user.userId;
      const admin = await adminUser.findById(adminUserId);

      if (!admin) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found",
            zh: "未找到管理员用户",
          },
        });
      }

      const record = await RebateLog.findById(rebateLogId);

      if (!record) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Rebate record not found",
            zh: "返水记录未找到",
          },
        });
      }

      if (record.claimed) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Rebate already claimed",
            zh: "返水已被领取",
          },
        });
      }

      if (record.totalRebate <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No rebate to claim",
            zh: "没有可领取的返水",
          },
        });
      }

      record.claimed = true;
      record.claimedBy = admin.username;
      record.claimedAt = new Date();
      await record.save();

      res.status(200).json({
        success: true,
        message: {
          en: `Rebate claimed successfully for ${record.username}`,
          zh: `${record.username} 的返水已成功领取`,
        },
      });
    } catch (error) {
      console.error("Error claiming rebate:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Run Rebate Function
async function runRebateCalculation() {
  try {
    const schedule = await RebateSchedule.findOne();
    if (!schedule) return;
    const now = moment().tz(TIMEZONE);
    const yesterday = moment(now).subtract(1, "day");
    const startDate = yesterday.startOf("day").toDate();
    const endDate = yesterday.endOf("day").toDate();
    const yesterdayString = yesterday.format("DD-MM-YYYY");

    await calculateWinLoseRebate(
      schedule.winLosePercentage,
      startDate,
      endDate,
      yesterdayString
    );
  } catch (error) {
    console.error("Rebate calculation error:", error);
    throw error;
  }
}

// Rebate Based on Winlose
async function calculateWinLoseRebate(
  percentage,
  startDate,
  endDate,
  dateString
) {
  try {
    console.log("Calculating for period:", { startDate, endDate });

    const deposits = await Deposit.find({
      createdAt: {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      },
      status: "approved",
      reverted: false,
    });

    const withdraws = await Withdraw.find({
      createdAt: {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      },
      status: "approved",
      reverted: false,
    });

    const bonus = await Bonus.find({
      createdAt: {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      },
      status: "approved",
      reverted: false,
    });

    const userStats = {};

    deposits.forEach((deposit) => {
      if (!userStats[deposit.username]) {
        userStats[deposit.username] = {
          userId: deposit.userId,
          userid: deposit.userid,
          totaldeposit: 0,
          totalwithdraw: 0,
          totalbonus: 0,
          totalwinlose: 0,
          totalRebate: 0,
        };
      }
      userStats[deposit.username].totaldeposit += deposit.amount;
    });

    withdraws.forEach((withdraw) => {
      if (!userStats[withdraw.username]) {
        userStats[withdraw.username] = {
          userId: withdraw.userId,
          userid: withdraw.userid,
          totaldeposit: 0,
          totalwithdraw: 0,
          totalbonus: 0,
          totalwinlose: 0,
          totalRebate: 0,
        };
      }
      userStats[withdraw.username].totalwithdraw += withdraw.amount;
    });

    bonus.forEach((b) => {
      if (!userStats[b.username]) {
        userStats[b.username] = {
          userId: b.userId,
          userid: b.userid,
          totaldeposit: 0,
          totalwithdraw: 0,
          totalbonus: 0,
          totalwinlose: 0,
          totalRebate: 0,
        };
      }
      userStats[b.username].totalbonus += b.amount;
    });

    let createdCount = 0;

    for (const [username, stats] of Object.entries(userStats)) {
      stats.totalwinlose = stats.totaldeposit - stats.totalwithdraw;
      if (stats.totalwinlose > 0) {
        stats.totalRebate = Math.abs(stats.totalwinlose) * (percentage / 100);
        if (stats.totalRebate >= 1) {
          const existingRecord = await RebateLog.findOne({
            username,
            rebateissuesdate: {
              $gte: moment(startDate).startOf("day").toDate(),
              $lte: moment(startDate).endOf("day").toDate(),
            },
          });
          if (existingRecord) {
            console.log(
              `Record already exists for ${username} - ${dateString}`
            );
            continue;
          }
          await RebateLog.create({
            userId: stats.userId,
            userid: stats.userid,
            username,
            totaldeposit: stats.totaldeposit,
            totalwithdraw: stats.totalwithdraw,
            totalwinlose: stats.totalwinlose,
            totalbonus: stats.totalbonus,
            totalRebate: parseFloat(stats.totalRebate.toFixed(2)),
            rebateissuesdate: moment(startDate).toDate(),
            formula: `${Math.abs(stats.totalwinlose).toFixed(
              2
            )} * ${percentage}% = ${stats.totalRebate.toFixed(2)}`,
            type: "winlose",
            claimed: false,
          });

          createdCount++;
          console.log(
            `Rebate record created for ${username}: ${stats.totalRebate.toFixed(
              2
            )}`
          );
        }
      }
    }
    console.log(
      `Rebate calculation completed. Created: ${createdCount} records`
    );
  } catch (error) {
    console.error("Win/Lose rebate calculation error:", error);
    throw error;
  }
}

module.exports = router;
