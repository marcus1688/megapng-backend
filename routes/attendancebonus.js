const express = require("express");
const router = express.Router();
const cron = require("node-cron");
const moment = require("moment-timezone");
const { AttendanceBonus } = require("../models/attendancebonus.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { User } = require("../models/users.model");
const Deposit = require("../models/deposit.model");
const { adminUser } = require("../models/adminuser.model");

const TIMEZONE = "Pacific/Port_Moresby";
const BONUS_POINTS = 58;

// 每个拜1 12:10am Attendace Bonus
if (process.env.NODE_ENV !== "development") {
  cron.schedule(
    "10 0 * * 1",
    async () => {
      console.log(
        `[${moment()
          .tz(TIMEZONE)
          .format()}] Running attendance bonus calculation...`
      );
      await runAttendanceBonusCalculation();
    },
    {
      timezone: TIMEZONE,
    }
  );
}

async function runAttendanceBonusCalculation() {
  try {
    const now = moment().tz(TIMEZONE);
    const lastMonday = moment(now).subtract(1, "week").startOf("isoWeek");
    const lastSunday = moment(lastMonday).endOf("isoWeek");
    const weekStart = lastMonday.toDate();
    const weekEnd = lastSunday.toDate();
    const weekLabel = `${lastMonday.format("DD-MM-YYYY")} ~ ${lastSunday.format(
      "DD-MM-YYYY"
    )}`;
    console.log(`Calculating attendance for: ${weekLabel}`);
    const deposits = await Deposit.find({
      status: "approved",
      reverted: false,
      createdAt: {
        $gte: moment(weekStart).utc().toDate(),
        $lte: moment(weekEnd).utc().toDate(),
      },
    });
    const userDailyDeposits = {};
    deposits.forEach((deposit) => {
      const username = deposit.username;
      const depositDate = moment(deposit.createdAt).tz(TIMEZONE);
      const dayOfWeek = depositDate.isoWeekday();
      if (!userDailyDeposits[username]) {
        userDailyDeposits[username] = {
          userId: deposit.userId,
          userid: deposit.userid,
          days: new Set(),
        };
      }
      userDailyDeposits[username].days.add(dayOfWeek);
    });
    for (const [username, data] of Object.entries(userDailyDeposits)) {
      const dailyDeposits = {
        monday: data.days.has(1),
        tuesday: data.days.has(2),
        wednesday: data.days.has(3),
        thursday: data.days.has(4),
        friday: data.days.has(5),
        saturday: data.days.has(6),
        sunday: data.days.has(7),
      };
      const totalDaysDeposited = data.days.size;
      const isFullAttendance = totalDaysDeposited === 7;
      const bonusPoints = isFullAttendance ? BONUS_POINTS : 0;
      const existingRecord = await AttendanceBonus.findOne({
        username,
        weekStart,
      });
      if (existingRecord) {
        console.log(`Record already exists for ${username} - ${weekLabel}`);
        continue;
      }
      await AttendanceBonus.create({
        userId: data.userId,
        userid: data.userid,
        username,
        weekStart,
        weekEnd,
        weekLabel,
        dailyDeposits,
        totalDaysDeposited,
        isFullAttendance,
        bonusPoints,
      });
      if (isFullAttendance) {
        console.log(`Full attendance for ${username}: ${BONUS_POINTS} points`);
      } else {
        console.log(`${username}: ${totalDaysDeposited}/7 days`);
      }
    }

    console.log("Attendance bonus calculation completed");
  } catch (error) {
    console.error("Attendance bonus calculation error:", error);
  }
}

// Admin Get Attendance Bonus Report
router.get(
  "/admin/api/attendance-bonus",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate, username } = req.query;
      const filter = {};
      if (startDate && endDate) {
        filter.weekStart = {
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
      const records = await AttendanceBonus.find(filter).sort({
        createdAt: -1,
      });
      res.status(200).json({
        success: true,
        data: records,
      });
    } catch (error) {
      console.error("Error fetching attendance bonus report:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to fetch attendance bonus report",
          zh: "获取全勤奖励报告失败",
        },
      });
    }
  }
);

// Admin Claim Attendance Bonus
router.post(
  "/admin/api/attendance-bonus/claim",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { attendanceBonusId } = req.body;
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
      const record = await AttendanceBonus.findById(attendanceBonusId);
      if (!record) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Attendance bonus record not found",
            zh: "全勤奖励记录未找到",
          },
        });
      }
      if (record.claimed) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus already claimed",
            zh: "奖励已被领取",
          },
        });
      }
      if (!record.isFullAttendance) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User did not achieve full attendance",
            zh: "用户未达到全勤",
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
          en: `Attendance bonus claimed successfully for ${record.username}`,
          zh: `${record.username} 的全勤奖励已成功领取`,
        },
      });
    } catch (error) {
      console.error("Error claiming attendance bonus:", error);
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

// Admin Manual Trigger (测试用)
router.post(
  "/admin/api/attendance-bonus/manual-run",
  authenticateAdminToken,
  async (req, res) => {
    try {
      await runAttendanceBonusCalculation();
      res.status(200).json({
        success: true,
        message: {
          en: "Attendance bonus calculation completed",
          zh: "全勤奖励计算完成",
        },
      });
    } catch (error) {
      console.error("Error running manual calculation:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to run calculation",
          zh: "运行计算失败",
        },
      });
    }
  }
);

module.exports = router;
