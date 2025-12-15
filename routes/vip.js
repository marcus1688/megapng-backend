const express = require("express");
const vip = require("../models/vip.model");
const { adminUser } = require("../models/adminuser.model");
const { User } = require("../models/users.model");
const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const Withdraw = require("../models/withdraw.model");
const Deposit = require("../models/deposit.model");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
const moment = require("moment-timezone");
const { parse } = require("dotenv");
const cron = require("node-cron");
const VipMonthlyBonus = require("../models/vipmonthlybonus.model");
require("dotenv").config();
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fieldSize: 10 * 1024 * 1024,
    fileSize: 10 * 1024 * 1024,
  },
});
async function uploadFileToS3(file) {
  const folderPath = "vip/";
  const fileKey = `${folderPath}${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

// Get User VIP Icon
router.get("/api/vipicon", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const vipSettings = await vip.findOne();
    if (
      !vipSettings ||
      !vipSettings.vipLevels ||
      !vipSettings.vipLevels.length
    ) {
      return res.status(404).json({
        success: false,
        message: "VIP settings not found",
      });
    }
    const userVipLevel = user.viplevel || 0;
    if (userVipLevel === "member") {
      return res.json({
        success: true,
        data: {
          level: 0,
          iconUrl: "/favicon.png",
        },
      });
    }
    const vipLevelData = vipSettings.vipLevels[userVipLevel - 1];

    if (!vipLevelData) {
      return res.status(404).json({
        success: false,
        message: "VIP level data not found",
      });
    }
    res.json({
      success: true,
      data: {
        level: userVipLevel,
        iconUrl: vipLevelData.iconUrl || "/favicon.png",
      },
    });
  } catch (error) {
    console.error("Error getting VIP icon:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//  User Get VIP Settings
router.get("/api/vipsettings", async (req, res) => {
  try {
    const settings = await vip.find();
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin Create VIP Settings
router.post(
  "/admin/api/vipsettings",
  authenticateAdminToken,
  upload.any(),
  async (req, res) => {
    try {
      const vipData =
        typeof req.body.settings === "string"
          ? JSON.parse(req.body.settings)
          : req.body.settings;
      const files = req.files || [];
      let existingVip = await vip.findOne();
      if (existingVip) {
        const deletePromises = existingVip.vipLevels.map(
          async (oldLevel, oldIndex) => {
            const stillExists = vipData.vipLevels.some(
              (newLevel, newIndex) =>
                newIndex === oldIndex && newLevel.iconUrl === oldLevel.iconUrl
            );
            if (oldLevel.iconUrl && !stillExists) {
              const oldKey = oldLevel.iconUrl.split("/").pop();
              try {
                await s3Client.send(
                  new DeleteObjectCommand({
                    Bucket: process.env.S3_MAINBUCKET,
                    Key: `vip/${oldKey}`,
                  })
                );
              } catch (error) {
                console.error("Error deleting old icon:", error);
              }
            }
          }
        );
        await Promise.all(deletePromises);
      }
      const uploadPromises = vipData.vipLevels.map(async (level, index) => {
        const file = files.find((f) => f.fieldname === `icon_${index}`);
        if (file) {
          if (existingVip && existingVip.vipLevels[index]?.iconUrl) {
            const oldKey = existingVip.vipLevels[index].iconUrl
              .split("/")
              .pop();
            try {
              await s3Client.send(
                new DeleteObjectCommand({
                  Bucket: process.env.S3_MAINBUCKET,
                  Key: `vip/${oldKey}`,
                })
              );
            } catch (error) {
              console.error("Error deleting old icon:", error);
            }
          }
          level.iconUrl = await uploadFileToS3(file);
        } else if (
          existingVip &&
          existingVip.vipLevels[index]?.iconUrl &&
          level.iconUrl
        ) {
          level.iconUrl = existingVip.vipLevels[index].iconUrl;
        }
        return level;
      });
      vipData.vipLevels = await Promise.all(uploadPromises);
      if (existingVip) {
        const updatedVip = await vip.findByIdAndUpdate(
          existingVip._id,
          {
            $set: {
              tableTitle: vipData.tableTitle,
              rowHeaders: vipData.rowHeaders,
              vipLevels: vipData.vipLevels,
              terms: vipData.terms,
            },
          },
          { new: true }
        );
        return res.status(200).json({
          success: true,
          message: {
            en: "VIP settings updated successfully",
            zh: "VIP 设置更新成功",
          },
          data: updatedVip,
        });
      } else {
        const newVipSettings = new vip(vipData);
        await newVipSettings.save();
        return res.status(200).json({
          success: true,
          message: {
            en: "VIP settings created successfully",
            zh: "VIP 设置创建成功",
          },
          data: newVipSettings,
        });
      }
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "Error saving VIP settings",
          zh: "保存 VIP 设置时出错",
        },
      });
    }
  }
);

//  Admin Get VIP Settings
router.get(
  "/admin/api/vipsettings",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const settings = (await vip.findOne()) || {
        tableTitle: "VIP Benefits",
        rowHeaders: [],
        vipLevels: [],
        terms: { en: "", zh: "" },
      };
      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Admin Delete VIP Settings
router.delete(
  "/admin/api/vipsettings/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const existingVip = await vip.findById(req.params.id);
      if (!existingVip) {
        return res.status(404).json({
          success: false,
          message: "VIP settings not found",
        });
      }

      if (existingVip.iconUrl) {
        const imageKey = existingVip.iconUrl.split("/").slice(-2).join("/");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_MAINBUCKET,
            Key: imageKey,
          })
        );
      }

      await vip.findByIdAndDelete(req.params.id);
      res.json({
        success: true,
        message: "VIP settings deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

async function getVipLevelsFromDB() {
  const vipSettings = await vip.findOne({});
  if (
    !vipSettings ||
    !vipSettings.vipLevels ||
    vipSettings.vipLevels.length === 0
  ) {
    return [];
  }
  const sortedVipLevels = [...vipSettings.vipLevels].sort((a, b) => {
    let depositA = 0;
    let depositB = 0;
    if (a.benefits instanceof Map) {
      depositA = parseFloat(a.benefits.get("Total Deposit") || 0);
    } else {
      depositA = parseFloat(a.benefits["Total Deposit"] || 0);
    }
    if (b.benefits instanceof Map) {
      depositB = parseFloat(b.benefits.get("Total Deposit") || 0);
    } else {
      depositB = parseFloat(b.benefits["Total Deposit"] || 0);
    }
    return depositA - depositB;
  });

  return sortedVipLevels.map((l) => l.name);
}

function demoteVipLevel(currentLevel, vipLevels) {
  const currentIndex = vipLevels.indexOf(currentLevel);
  if (currentIndex <= 0) {
    return null;
  }
  return vipLevels[currentIndex - 1];
}

async function getVipBenefitsFromDB() {
  const vipSettings = await vip.findOne({});
  if (
    !vipSettings ||
    !vipSettings.vipLevels ||
    vipSettings.vipLevels.length === 0
  ) {
    return {};
  }
  const benefitsMap = {};
  for (const level of vipSettings.vipLevels) {
    let monthlyBonus = 0;
    if (level.benefits instanceof Map) {
      monthlyBonus = parseFloat(level.benefits.get("Monthly Bonus") || 0);
    } else {
      monthlyBonus = parseFloat(level.benefits["Monthly Bonus"] || 0);
    }
    benefitsMap[level.name] = monthlyBonus;
  }
  return benefitsMap;
}

async function checkMonthlyVipDemotion() {
  try {
    const vipLevels = await getVipLevelsFromDB();
    if (vipLevels.length === 0) {
      return { success: false, message: "VIP settings not found" };
    }

    const vipBenefits = await getVipBenefitsFromDB();

    const lastMonthStart = moment()
      .tz("Asia/Kuala_Lumpur")
      .subtract(1, "month")
      .startOf("month")
      .utc()
      .toDate();

    const lastMonthEnd = moment()
      .tz("Asia/Kuala_Lumpur")
      .subtract(1, "month")
      .endOf("month")
      .utc()
      .toDate();

    const thisMonthStart = moment()
      .tz("Asia/Kuala_Lumpur")
      .startOf("month")
      .utc()
      .toDate();

    const thisMonthEnd = moment()
      .tz("Asia/Kuala_Lumpur")
      .endOf("month")
      .utc()
      .toDate();

    const monthLabel = moment().tz("Asia/Kuala_Lumpur").format("MMMM YYYY");

    const usersWithDeposits = await Deposit.distinct("userId", {
      status: "approved",
      reverted: false,
      createdAt: {
        $gte: lastMonthStart,
        $lte: lastMonthEnd,
      },
    });

    const usersWithVip = await User.find({
      viplevel: { $ne: null },
    });

    let demotedCount = 0;
    let restoredCount = 0;
    let bonusCreatedCount = 0;

    for (const user of usersWithVip) {
      const hasDeposit = usersWithDeposits.some(
        (depositUserId) => depositUserId.toString() === user._id.toString()
      );

      let finalThisMonthVip = user.thisMonthVip || user.viplevel;

      if (!hasDeposit) {
        const currentThisMonthVip = user.thisMonthVip || user.viplevel;
        const newLevel = demoteVipLevel(currentThisMonthVip, vipLevels);

        user.thisMonthVip = newLevel;
        finalThisMonthVip = newLevel;
        await user.save();

        demotedCount++;
      } else {
        if (user.thisMonthVip !== user.viplevel) {
          user.thisMonthVip = user.viplevel;
          finalThisMonthVip = user.viplevel;
          await user.save();

          restoredCount++;
        }
      }

      const bonusAmount = vipBenefits[finalThisMonthVip] || 0;

      if (bonusAmount > 0) {
        const existingBonus = await VipMonthlyBonus.findOne({
          username: user.username,
          monthStart: thisMonthStart,
        });

        if (!existingBonus) {
          await VipMonthlyBonus.create({
            userId: user._id,
            userid: user.userid,
            username: user.username,
            monthStart: thisMonthStart,
            monthEnd: thisMonthEnd,
            monthLabel: monthLabel,
            viplevel: user.viplevel,
            thisMonthVip: finalThisMonthVip,
            bonusAmount: bonusAmount,
            claimed: false,
          });

          bonusCreatedCount++;
        }
      }
    }

    console.log(
      `[VIP Monthly Check] Completed - Checked: ${usersWithVip.length}, Demoted: ${demotedCount}, Restored: ${restoredCount}, Bonus Created: ${bonusCreatedCount}`
    );

    return {
      success: true,
      demotedCount,
      restoredCount,
      bonusCreatedCount,
      checkedUsers: usersWithVip.length,
    };
  } catch (error) {
    console.error("[VIP Monthly Check] Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Admin Get VIP Monthly Bonus Report
router.get(
  "/admin/api/vip-monthly-bonus",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate, username } = req.query;
      const filter = {};

      if (startDate && endDate) {
        filter.monthStart = {
          $gte: moment
            .tz(new Date(startDate), "Asia/Kuala_Lumpur")
            .startOf("day")
            .toDate(),
          $lte: moment
            .tz(new Date(endDate), "Asia/Kuala_Lumpur")
            .endOf("day")
            .toDate(),
        };
      }

      if (username) {
        filter.username = new RegExp(username, "i");
      }

      const records = await VipMonthlyBonus.find(filter).sort({
        createdAt: -1,
      });

      res.status(200).json({
        success: true,
        data: records,
      });
    } catch (error) {
      console.error("Error fetching VIP monthly bonus report:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to fetch VIP monthly bonus report",
          zh: "获取VIP月度奖金报告失败",
        },
      });
    }
  }
);

// Admin Claim VIP Monthly Bonus
router.post(
  "/admin/api/vip-monthly-bonus/claim",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { vipMonthlyBonusId } = req.body;
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

      const record = await VipMonthlyBonus.findById(vipMonthlyBonusId);

      if (!record) {
        return res.status(200).json({
          success: false,
          message: {
            en: "VIP monthly bonus record not found",
            zh: "VIP月度奖金记录未找到",
          },
        });
      }

      if (record.claimed) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus already claimed",
            zh: "奖金已被领取",
          },
        });
      }

      if (record.bonusAmount === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No bonus to claim",
            zh: "没有可领取的奖金",
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
          en: `VIP monthly bonus claimed successfully for ${record.username}`,
          zh: `${record.username} 的VIP月度奖金已成功领取`,
        },
      });
    } catch (error) {
      console.error("Error claiming VIP monthly bonus:", error);
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

// Admin Manual Run (测试用)
router.post(
  "/admin/api/vip-monthly-bonus/manual-run",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const result = await checkMonthlyVipDemotion();
      res.status(200).json({
        success: true,
        message: {
          en: "VIP monthly check and bonus distribution completed",
          zh: "VIP月度检查和奖金派发完成",
        },
        data: result,
      });
    } catch (error) {
      console.error("Error in manual run:", error);
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

if (process.env.NODE_ENV !== "development") {
  cron.schedule(
    "0 0 1 * *",
    async () => {
      await checkMonthlyVipDemotion();
    },
    {
      timezone: "Asia/Kuala_Lumpur",
    }
  );
}

module.exports = router;
