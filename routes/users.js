const express = require("express");
const bcrypt = require("bcrypt");
const { Kiosk } = require("../models/kiosk.model");
const {
  User,
  userLog,
  adminUserWalletLog,
  GameDataLog,
} = require("../models/users.model");
const UserBankList = require("../models/userbanklist.model");
const { addContactToGoogle } = require("../utils/googleContact");
const Promotion = require("../models/promotion.model");
const { adminUser, adminLog } = require("../models/adminuser.model");
const router = express.Router();
const Deposit = require("../models/deposit.model");
const vip = require("../models/vip.model");
const Withdraw = require("../models/withdraw.model");
const { RebateLog } = require("../models/rebate.model");
const sms = require("../models/sms.model");
const UserWalletCashOut = require("../models/userwalletcashout.model");
const UserWalletCashIn = require("../models/userwalletcashin.model");
const Lock = require("../models/lock.model");
const jwt = require("jsonwebtoken");
const { checkForSimilarNames } = require("../utils/nameValidator");
const { general } = require("../models/general.model");
const {
  generateToken,
  generateGameToken,
  setCookie,
  authenticateToken,
  generateRefreshToken,
  handleLoginSuccess,
  setRefreshCookie,
  clearCookie,
} = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const geoip = require("geoip-lite");
const BankList = require("../models/banklist.model");
const BankTransactionLog = require("../models/banktransactionlog.model");
const UserWalletLog = require("../models/userwalletlog.model");
const Bonus = require("../models/bonus.model");
const querystring = require("querystring");
const GameWalletLog = require("../models/gamewalletlog.model");
const LuckySpinSetting = require("../models/luckyspinsetting.model");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const { Contact } = require("../models/contact.model");
const axios = require("axios");
const crypto = require("crypto");
const moment = require("moment");
const {
  AgentCommission,
  AgentCommissionReport,
} = require("../models/agent.model");
const Fingerprint = require("../models/fingerprint.model");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const mg = require("nodemailer-mailgun-transport");
const { v4: uuidv4 } = require("uuid");
const messagebird = require("messagebird");
const QRCode = require("qrcode");
const rateLimit = require("express-rate-limit");
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 30, // 限制每个IP在1小时内最多30次尝试
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  handler: (req, res, next, options) => {
    const clientIp = req.headers["x-forwarded-for"] || req.ip;
    const clientIpTrimmed = clientIp.split(",")[0].trim();
    const origin = req.headers.origin || "Unknown";

    console.log(
      `Login Rate Limit Exceeded - IP: ${clientIpTrimmed}, Origin: ${origin}, Path: ${
        req.path
      }, Time: ${new Date().toISOString()}`
    );

    res.status(options.statusCode).send(options.message);
  },
});

dotenv.config();

router.use(express.json());

async function generateQRWithLogo(
  text,
  logoData = null,
  maxLogoWidth = 80,
  maxLogoHeight = 80
) {
  try {
    const canvas = createCanvas(400, 400);
    const ctx = canvas.getContext("2d");
    await QRCode.toCanvas(canvas, text, {
      width: 400,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "H",
    });
    const logoToUse = logoData || path.join(__dirname, "../public/logo.png");
    if (logoToUse) {
      const logo = await loadImage(logoToUse);
      const logoAspectRatio = logo.width / logo.height;
      let logoWidth = maxLogoWidth;
      let logoHeight = maxLogoHeight;
      if (logoAspectRatio > 1) {
        logoWidth = maxLogoWidth;
        logoHeight = logoWidth / logoAspectRatio;
      } else {
        logoHeight = maxLogoHeight;
        logoWidth = logoHeight * logoAspectRatio;
      }

      if (logoWidth > maxLogoWidth) {
        logoWidth = maxLogoWidth;
        logoHeight = logoWidth / logoAspectRatio;
      }
      if (logoHeight > maxLogoHeight) {
        logoHeight = maxLogoHeight;
        logoWidth = logoHeight * logoAspectRatio;
      }
      const clearSize = Math.max(logoWidth, logoHeight) + 24;
      const x = (400 - logoWidth) / 2;
      const y = (400 - logoHeight) / 2;
      const clearX = (400 - clearSize) / 2;
      const clearY = (400 - clearSize) / 2;
      ctx.fillStyle = "white";
      ctx.fillRect(clearX, clearY, clearSize, clearSize);
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.roundRect(clearX, clearY, clearSize, clearSize, 12);
      ctx.fill();
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.drawImage(logo, x, y, logoWidth, logoHeight);
    }

    return canvas.toDataURL();
  } catch (error) {
    console.error("Error generating QR with logo:", error);
    return await QRCode.toDataURL(text);
  }
}

async function generateUniqueReferralCode() {
  let referralCode;
  let isUnique = false;

  while (!isUnique) {
    referralCode = crypto.randomBytes(4).toString("hex");
    const existingUser = await User.findOne({ referralCode: referralCode });
    if (!existingUser) {
      isUnique = true;
    }
  }
  return referralCode;
}

const generateReferralLink = (referralCode) => {
  return `${process.env.REFERRAL_URL}${referralCode}`;
};

function formatSeconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(secs).padStart(2, "0")}`;
}

function calculateProcessingTime(createdAtDate) {
  const approvedAt = new Date();
  const createdAt = new Date(createdAtDate);
  let timeDiff = approvedAt.getTime() - createdAt.getTime();

  let seconds = Math.floor((timeDiff / 1000) % 60);
  let minutes = Math.floor((timeDiff / (1000 * 60)) % 60);
  let hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function parseTimeToSeconds(timeString) {
  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
//Main function for averageprocessingtime
async function updateAverageProcessingTime(
  username,
  newProcessTime,
  transactionType
) {
  const admin = await adminUser.findOne({ username: username });
  if (!admin) {
    return res.status(200).json({ message: "Admin not found!" });
  }

  const newProcessTimeInSeconds = parseTimeToSeconds(newProcessTime);

  if (transactionType === "deposit") {
    admin.totalDepositProcessingTime += newProcessTimeInSeconds;
    admin.depositTransactionCount += 1;
    if (admin.depositTransactionCount > 0) {
      const averageSeconds =
        admin.totalDepositProcessingTime / admin.depositTransactionCount;
      admin.averageDepositProcessingTime = formatTime(averageSeconds);
    }
  } else if (transactionType === "withdrawal") {
    admin.totalWithdrawalProcessingTime += newProcessTimeInSeconds;
    admin.withdrawalTransactionCount += 1;
    if (admin.withdrawalTransactionCount > 0) {
      const averageSeconds =
        admin.totalWithdrawalProcessingTime / admin.withdrawalTransactionCount;
      admin.averageWithdrawalProcessingTime = formatTime(averageSeconds);
    }
  }

  await admin.save();
}

async function adminLogAttempt(company, username, fullname, clientIp, remark) {
  await adminLog.create({
    company,
    username,
    fullname,
    loginTime: new Date(),
    ip: clientIp,
    remark,
  });
}

async function userLogAttempt(
  username,
  fullname,
  phonenumber,
  source,
  clientIp,
  ipcountry,
  ipcity,
  remark
) {
  await userLog.create({
    username,
    fullname,
    phonenumber,
    source,
    ipaddress: clientIp,
    ipcountry,
    ipcity,
    loginTime: new Date(),
    remark,
  });
}

async function updateUserReferral(
  userId,
  referralByUsername,
  adminUsername,
  adminFullname,
  clientIp
) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return {
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      };
    }
    const originalReferrer =
      user.referralBy && user.referralBy.username
        ? user.referralBy.username
        : "none";
    if (!referralByUsername) {
      if (user.referralBy && user.referralBy.user_id) {
        await User.updateOne(
          { _id: user.referralBy.user_id },
          { $pull: { referrals: { user_id: user._id } } }
        );
      }
      user.referralBy = null;
      await user.save();
      await adminLog.create({
        username: adminUsername,
        fullname: adminFullname,
        loginTime: new Date(),
        ip: clientIp,
        remark: `Cleared referral relationship for user: ${user.username} (previously referred by: ${originalReferrer})`,
      });
      return {
        success: true,
        message: {
          en: "Referral relationship cleared successfully",
          zh: "推荐关系已成功清除",
        },
      };
    }
    const referrer = await User.findOne({ username: referralByUsername });
    if (!referrer) {
      return {
        success: false,
        message: {
          en: "Referrer not found",
          zh: "找不到推荐人",
        },
      };
    }
    if (referrer._id.toString() === userId) {
      return {
        success: false,
        message: {
          en: "Users cannot refer themselves",
          zh: "用户不能推荐自己",
        },
      };
    }
    if (user.referralBy && user.referralBy.user_id) {
      await User.updateOne(
        { _id: user.referralBy.user_id },
        { $pull: { referrals: { user_id: user._id } } }
      );
    }
    user.referralBy = {
      user_id: referrer._id,
      username: referrer.username,
    };
    await user.save();
    const referralExists = await User.findOne({
      _id: referrer._id,
      "referrals.user_id": user._id,
    });
    if (!referralExists) {
      await User.updateOne(
        { _id: referrer._id },
        {
          $push: {
            referrals: {
              user_id: user._id,
              username: user.username,
            },
          },
        }
      );
    }
    await adminLog.create({
      username: adminUsername,
      fullname: adminFullname,
      loginTime: new Date(),
      ip: clientIp,
      remark: `Changed referral for user: ${user.username} from ${originalReferrer} to ${referrer.username}`,
    });
    return {
      success: true,
      message: {
        en: "User referral updated successfully",
        zh: "用户推荐关系更新成功",
      },
    };
  } catch (error) {
    console.error("Error updating referral relationship:", error);
    return {
      success: false,
      message: {
        en: "Internal server error when updating referral",
        zh: "更新推荐关系时发生内部服务器错误",
      },
      error: error.message,
    };
  }
}

async function generateUniqueGameId() {
  let result = "";
  let isUnique = false;

  while (!isUnique) {
    result =
      "A" +
      Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, "0");

    const existingUser = await User.findOne({
      gameId: result,
    });

    if (!existingUser) {
      isUnique = true;
    }
  }

  return result;
}

// Register User
router.post("/api/register", async (req, res) => {
  const {
    username,
    fullname,
    password,
    phonenumber,
    referralCode,
    isPhoneVerified,
    fingerprintData,
  } = req.body;

  if (!username || !password || !fullname) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Please fill in all required fields",
        zh: "请填写所有必填字段",
        zh_hk: "請填寫所有必填欄位",
        ms: "Sila isi semua ruangan yang diperlukan",
        id: "Silakan isi semua field yang diperlukan",
      },
    });
  }

  if (!/^[a-zA-Z\s]+$/.test(fullname)) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Full name can only contain letters and spaces",
        zh: "全名只能包含字母和空格",
        zh_hk: "全名只可以包含字母同空格",
        ms: "Nama penuh hanya boleh mengandungi huruf dan ruang",
        id: "Nama lengkap hanya boleh berisi huruf dan spasi",
      },
    });
  }

  if (!/^[a-zA-Z0-9]+$/.test(username)) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Username can only contain letters and numbers",
        zh: "用户名只能包含字母和数字",
        zh_hk: "用戶名只可以包含字母同數字",
        ms: "Nama pengguna hanya boleh mengandungi huruf dan nombor",
        id: "Username hanya boleh berisi huruf dan angka",
      },
    });
  }

  if (username.length < 6) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Username must be at least 6 characters long",
        zh: "用户名长度必须至少为6个字符",
        zh_hk: "用戶名長度必須至少為6個字符",
        ms: "Nama pengguna mestilah sekurang-kurangnya 6 aksara",
        id: "Username harus minimal 6 karakter",
      },
    });
  }

  if (password.length < 8) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Password must be at least 8 characters long",
        zh: "密码长度必须至少为8个字符",
        zh_hk: "密碼長度必須至少為8個字符",
        ms: "Kata laluan mestilah sekurang-kurangnya 8 aksara",
        id: "Password harus minimal 8 karakter",
      },
    });
  }
  const smsSettings = await sms.findOne({});
  if (smsSettings && smsSettings.status && !isPhoneVerified) {
    return res.status(200).json({
      success: false,
      message: {
        en: "Phone number verification is required",
        zh: "需要验证电话号码",
        zh_hk: "需要驗證電話號碼",
        ms: "Pengesahan nombor telefon diperlukan",
        id: "Verifikasi nomor telepon diperlukan",
      },
    });
  }
  const normalizedUsername = username.toLowerCase();
  const cleanedFullname = fullname.trim().replace(/\s+/g, " ");
  const formattedNumber = String(phonenumber).startsWith("675")
    ? String(phonenumber)
    : `675${phonenumber}`;

  const normalizedFullname = cleanedFullname.toLowerCase();
  let clientIp = req.headers["x-forwarded-for"] || req.ip;
  clientIp = clientIp.split(",")[0].trim();
  try {
    if (fingerprintData && fingerprintData.visitorId) {
      const existingFingerprint = await Fingerprint.findOne({
        $or: [{ visitorId: fingerprintData.visitorId }],
      });
      if (existingFingerprint) {
        console.log(`Duplicate device/IP detected:`);
        console.log(`VisitorId: ${fingerprintData.visitorId}`);
        console.log(`IP: ${fingerprintData.ip}`);
        console.log(`Existing user: ${existingFingerprint.username}`);
        console.log(`Attempting username: ${username}`);
        try {
          const duplicateFingerprintRecord = new Fingerprint({
            visitorId: fingerprintData.visitorId,
            requestId: fingerprintData.requestId,
            browserName: fingerprintData.browserName,
            browserVersion: fingerprintData.browserVersion,
            confidence: fingerprintData.confidence,
            device: fingerprintData.device,
            firstSeenAt: fingerprintData.firstSeenAt,
            incognito: fingerprintData.incognito,
            ip: fingerprintData.ip,
            lastSeenAt: fingerprintData.lastSeenAt,
            meta: fingerprintData.meta,
            os: fingerprintData.os,
            osVersion: fingerprintData.osVersion,
            visitorFound: fingerprintData.visitorFound,
            cacheHit: fingerprintData.cacheHit,
            userId: null,
            username: username,
            isDuplicateAttempt: true,
          });
          await duplicateFingerprintRecord.save();
        } catch (fpError) {
          console.error("Error saving duplicate fingerprint attempt:", fpError);
        }
        return res.status(200).json({
          success: false,
          message: {
            en: "This device or IP has already been used to register an account. Each device can only register one account.",
            zh: "此设备或IP已经注册过账号。每个设备只能注册一个账号。",
            zh_hk: "此設備或IP已經註冊過賬號。每個設備只能註冊一個賬號。",
            ms: "Peranti atau IP ini telah digunakan untuk mendaftar akaun. Setiap peranti hanya boleh mendaftar satu akaun.",
            id: "Perangkat atau IP ini sudah digunakan untuk mendaftar akun. Setiap perangkat hanya bisa mendaftar satu akun.",
          },
        });
      }
    }
    const existingUser = await User.findOne({
      $or: [{ fullname: new RegExp(`^${normalizedFullname}$`, "i") }],
    });
    if (existingUser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Full name is already registered. Please try a different one.",
          zh: "全名已被注册。请尝试使用其他名称。",
          zh_hk: "全名已被註冊。請嘗試使用其他名稱。",
          ms: "Nama penuh sudah didaftarkan. Sila cuba nama yang lain.",
          id: "Nama lengkap sudah terdaftar. Silakan coba yang lain.",
        },
      });
    }
    const nameCheck = await checkForSimilarNames(null, cleanedFullname);
    if (nameCheck.hasSimilar) {
      return res.status(200).json({
        success: false,
        message: {
          en: "This name or a similar name is already registered",
          zh: "此姓名或相似姓名已被注册",
          zh_hk: "此姓名或相似姓名已被註冊",
          ms: "Nama ini atau nama yang serupa sudah didaftarkan",
          id: "Nama ini atau nama serupa sudah terdaftar",
        },
      });
    }
    const existingUsername = await User.findOne({
      username: normalizedUsername,
    });
    if (existingUsername) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Username is already taken. Please choose a different one.",
          zh: "用户名已被占用。请选择其他用户名。",
          zh_hk: "用戶名已被佔用。請選擇其他用戶名。",
          ms: "Nama pengguna sudah diambil. Sila pilih yang lain.",
          id: "Username sudah digunakan. Silakan pilih yang lain.",
        },
      });
    }
    const existingPhoneNumber = await User.findOne({
      phonenumber: formattedNumber,
    });

    if (existingPhoneNumber) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Phone number is already registered. Please use a different number.",
          zh: "手机号码已被注册。请使用其他号码。",
          zh_hk: "手機號碼已被註冊。請使用其他號碼。",
          ms: "Nombor telefon sudah didaftarkan. Sila gunakan nombor yang berbeza.",
          id: "Nomor telepon sudah terdaftar. Silakan gunakan nomor yang berbeda.",
        },
      });
    }

    const allUsersWithSameIp = await User.find({
      $or: [
        { lastLoginIp: clientIp },
        { lastLoginIp: fingerprintData?.ip },
        { registerIp: clientIp },
        { registerIp: fingerprintData?.ip },
      ],
    });

    const isDuplicateIP = allUsersWithSameIp.length > 0;

    if (isDuplicateIP) {
      const userIdsToUpdate = allUsersWithSameIp.map((u) => u._id);
      if (userIdsToUpdate.length > 0) {
        await User.updateMany(
          { _id: { $in: userIdsToUpdate } },
          { $set: { duplicateIP: true } }
        );
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newReferralCode = await generateUniqueReferralCode();
    const referralLink = generateReferralLink(newReferralCode);
    const referralQrCode = await generateQRWithLogo(referralLink);

    let referralBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode });
      if (referrer) {
        referralBy = {
          user_id: referrer._id,
          username: referrer.username,
        };
      }
    }

    const newUser = await User.create({
      username: normalizedUsername,
      fullname: normalizedFullname,
      password: hashedPassword,
      phonenumber: formattedNumber,
      registerIp: fingerprintData.ip,
      referralLink,
      referralCode: newReferralCode,
      referralQrCode,
      referralBy,
      duplicateIP: isDuplicateIP,
      isPhoneVerified: isPhoneVerified,
      viplevel: null,
      registerVisitorId: fingerprintData?.visitorId || null,
      gameId: await generateUniqueGameId(),
    });

    if (fingerprintData && fingerprintData.visitorId) {
      try {
        const fingerprintRecord = new Fingerprint({
          visitorId: fingerprintData.visitorId,
          requestId: fingerprintData.requestId,
          browserName: fingerprintData.browserName,
          browserVersion: fingerprintData.browserVersion,
          confidence: fingerprintData.confidence,
          device: fingerprintData.device,
          firstSeenAt: fingerprintData.firstSeenAt,
          incognito: fingerprintData.incognito,
          ip: fingerprintData.ip,
          lastSeenAt: fingerprintData.lastSeenAt,
          meta: fingerprintData.meta,
          os: fingerprintData.os,
          osVersion: fingerprintData.osVersion,
          visitorFound: fingerprintData.visitorFound,
          cacheHit: fingerprintData.cacheHit,
          userId: newUser._id,
          username: newUser.username,
        });
        await fingerprintRecord.save();
      } catch (fpError) {
        console.error("Error saving fingerprint:", fpError);
      }
    }

    if (referralBy) {
      await User.findByIdAndUpdate(referralBy.user_id, {
        $push: {
          referrals: {
            user_id: newUser._id,
            username: newUser.username,
          },
        },
      });
    }
    res.status(200).json({
      success: true,
      message: {
        en: "User created successfully",
        zh: "用户创建成功",
        zh_hk: "用戶建立成功",
        ms: "Pengguna berjaya dicipta",
        id: "Pengguna berhasil dibuat",
      },
    });
  } catch (error) {
    console.error("Error occurred while creating user:", error);
    res.status(200).json({
      success: false,
      message: {
        en: "Registration failed due to a system error. Please try again later",
        zh: "由于系统错误，注册失败。请稍后再试",
        zh_hk: "由於系統錯誤，註冊失敗。請稍後再試",
        ms: "Pendaftaran gagal kerana ralat sistem. Sila cuba lagi kemudian",
        id: "Registrasi gagal karena kesalahan sistem. Silakan coba lagi nanti",
      },
    });
  }
});

// Refresh Token

// User Login
router.post("/api/login", loginLimiter, async (req, res) => {
  let { username, password } = req.body;
  username = username?.trim().replace(/\s+/g, " ") || "";
  const normalizedUsername = username.toLowerCase();
  let clientIp = req.headers["x-forwarded-for"] || req.ip;
  clientIp = clientIp.split(",")[0].trim();
  const geo = geoip.lookup(clientIp);
  try {
    const user = await User.findOne({
      username: normalizedUsername,
    });
    if (!user) {
      await userLogAttempt(
        normalizedUsername,
        "-",
        null,
        req.get("User-Agent"),
        clientIp,
        geo ? geo.country : "Unknown",
        geo ? geo.city : "Unknown",
        `Invalid Login: Wrong Username Attempted ${normalizedUsername}`
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "Login unsuccessful. Please ensure your details are correct or contact customer service.",
          zh: "登录失败。请确认您的信息正确或联系客服。",
          zh_hk: "登入失敗。請確認你嘅資料正確或聯繫客服。",
          ms: "Log masuk tidak berjaya. Sila pastikan butiran anda betul atau hubungi khidmat pelanggan.",
          id: "Login gagal. Silakan pastikan detail Anda benar atau hubungi layanan pelanggan.",
        },
      });
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      await userLogAttempt(
        user.username,
        user.fullname,
        user.phonenumber,
        req.get("User-Agent"),
        clientIp,
        geo ? geo.country : "Unknown",
        geo ? geo.city : "Unknown",
        `Invalid Login: Wrong Password Attempted ${password}`
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "Login unsuccessful. Please ensure your details are correct or contact customer service.",
          zh: "登录失败。请确认您的信息正确或联系客服。",
          zh_hk: "登入失敗。請確認你嘅資料正確或聯繫客服。",
          ms: "Log masuk tidak berjaya. Sila pastikan butiran anda betul atau hubungi khidmat pelanggan.",
          id: "Login gagal. Silakan pastikan detail Anda benar atau hubungi layanan pelanggan.",
        },
      });
    }
    if (user.status === false) {
      await userLogAttempt(
        user.username,
        user.fullname,
        user.phonenumber,
        req.get("User-Agent"),
        clientIp,
        geo ? geo.country : "Unknown",
        geo ? geo.city : "Unknown",
        "Invalid Login: Account Is Inactive"
      );
      return res.status(200).json({
        success: false,
        status: "inactive",
        message: {
          en: "Your account is currently inactive",
          zh: "您的账号当前未激活",
          zh_hk: "你嘅賬號目前未激活",
          ms: "Akaun anda kini tidak aktif",
          id: "Akun Anda saat ini tidak aktif",
        },
      });
    }
    const allUsersWithSameIp = await User.find({
      _id: { $ne: user._id },
      $or: [{ lastLoginIp: clientIp }, { registerIp: clientIp }],
    });

    const isDuplicateIP = allUsersWithSameIp.length > 0;

    if (isDuplicateIP) {
      const userIdsToUpdate = [
        ...allUsersWithSameIp.map((u) => u._id),
        user._id,
      ];
      await User.updateMany(
        { _id: { $in: userIdsToUpdate } },
        { $set: { duplicateIP: true } }
      );
    }
    await User.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      lastLoginIp: clientIp,
    });

    const { token, refreshToken, newGameToken } = await handleLoginSuccess(
      user._id
    );

    await userLogAttempt(
      user.username,
      user.fullname,
      user.phonenumber,
      req.get("User-Agent"),
      clientIp,
      geo ? geo.country : "Unknown",
      geo ? geo.city : "Unknown",
      isDuplicateIP ? "Login Success - Duplicate IP Detected" : "Login Success"
    );
    res.status(200).json({
      success: true,
      token,
      refreshToken,
      newGameToken,
      message: {
        en: "Login successful",
        zh: "登录成功",
        zh_hk: "登入成功",
        ms: "Log masuk berjaya",
        id: "Login berhasil",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "An error occurred. Please try again later",
        zh: "发生错误，请稍后再试",
        zh_hk: "發生錯誤，請稍後再試",
        ms: "Ralat berlaku. Sila cuba lagi kemudian",
        id: "Terjadi kesalahan. Silakan coba lagi nanti",
      },
    });
  }
});

// Refresh Token
router.post("/api/refresh-token", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const refreshToken = authHeader && authHeader.split(" ")[1];
  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token not provided" });
  }
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const newToken = await generateToken(decoded.userId);

    res.json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

router.post("/api/game-token", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    const newGameToken = await generateGameToken(user._id);

    return res.status(200).json({
      success: true,
      gameToken: newGameToken,
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid game token" });
  }
});

router.post(
  "/api/game-token-validtest",
  authenticateToken,
  async (req, res) => {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    try {
      const { gameToken } = req.body;

      const decodedToken = jwt.verify(gameToken, process.env.JWT_GAME_SECRET);

      return res.status(200).json({
        success: true,
      });
    } catch (error) {
      if (
        error.message === "jwt expired" ||
        error.message === "invalid token" ||
        error.message === "jwt malformed"
      ) {
        const newGameToken = await generateGameToken(user._id);

        return res.status(200).json({
          success: false,
          gameToken: newGameToken,
        });
      } else {
        res.status(401).json({ message: "Invalid game token" });
      }
    }
  }
);

// Logout User
router.post("/api/logout", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();
    const geo = geoip.lookup(clientIp);
    await userLogAttempt(
      user.username,
      user.fullname,
      user.phonenumber,
      req.get("User-Agent"),
      clientIp,
      geo ? geo.country : "Unknown",
      geo ? geo.city : "Unknown",
      "Logout Success"
    );
    res.status(200).json({
      success: true,
      message: {
        en: "Logout successful",
        zh: "登出成功",
        zh_hk: "登出成功",
        ms: "Log keluar berjaya",
        id: "Logout berhasil",
      },
    });
  } catch (error) {
    console.error("Error occurred while logging out:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "An error occurred while logging out",
        zh: "登出时发生错误",
        zh_hk: "登出時發生錯誤",
        ms: "Ralat berlaku semasa log keluar",
        id: "Terjadi kesalahan saat logout",
      },
    });
  }
});

// Get User Data
router.get("/api/userdata", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select(
      "fullname username bankAccounts positionTaking totaldeposit email telegramId facebookId lastLogin phonenumber wallet createdAt dob withdrawlock rebate email isPhoneVerified isEmailVerified monthlyBonusCountdownTime monthlyLoyaltyCountdownTime weeklySignInTime totaldeposit viplevel cryptoWallet luckySpinCount referralLink referralCode referralQrCode totalturnover firstDepositDate luckySpinAmount luckySpinClaim wallettwo"
    );
    if (!user) {
      return res.status(200).json({ message: "用户未找到" });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Error occurred while retrieving user data:", error);
    res.status(200).json({ message: "Internal server error" });
  }
});

// Change User Password
router.post("/api/changepassword", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please enter both old password and new password",
          zh: "请输入旧密码和新密码",
          zh_hk: "請輸入舊密碼同新密碼",
          ms: "Sila masukkan kata laluan lama dan kata laluan baru",
          id: "Silakan masukkan password lama dan password baru",
        },
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(200).json({
        success: false,
        message: {
          en: "New passwords do not match",
          zh: "输入的新密码不匹配",
          zh_hk: "輸入嘅新密碼不匹配",
          ms: "Kata laluan baru tidak sepadan",
          id: "Password baru tidak cocok",
        },
      });
    }
    if (newPassword.length < 8) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Password must be at least 8 characters long",
          zh: "密码长度必须至少为8个字符",
          zh_hk: "密碼長度必須至少為8個字符",
          ms: "Kata laluan mestilah sekurang-kurangnya 8 aksara",
          id: "Password harus minimal 8 karakter",
        },
      });
    }
    const user = await User.findById(userId);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Current password is incorrect",
          zh: "当前密码不正确",
          zh_hk: "當前密碼不正確",
          ms: "Kata laluan semasa tidak betul",
          id: "Password saat ini salah",
        },
      });
    }
    if (oldPassword === newPassword) {
      return res.status(200).json({
        success: false,
        message: {
          en: "New password cannot be the same as the current password",
          zh: "新密码不能与当前密码相同",
          zh_hk: "新密碼不可以同當前密碼相同",
          ms: "Kata laluan baru tidak boleh sama dengan kata laluan semasa",
          id: "Password baru tidak boleh sama dengan password saat ini",
        },
      });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    await user.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Password has been changed successfully",
        zh: "密码修改成功",
        zh_hk: "密碼修改成功",
        ms: "Kata laluan telah berjaya ditukar",
        id: "Password berhasil diubah",
      },
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "An error occurred. Please try again later",
        zh: "发生错误，请稍后再试",
        zh_hk: "發生錯誤，請稍後再試",
        ms: "Ralat berlaku. Sila cuba lagi kemudian",
        id: "Terjadi kesalahan. Silakan coba lagi nanti",
      },
    });
  }
});

// Add Bank
router.post("/api/addbank", async (req, res) => {
  try {
    const { name, bankname, banknumber } = req.body;

    if (!bankname || !banknumber || !name) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank name, account number and name cannot be empty",
          zh: "银行名称、账号和姓名不能为空",
          zh_hk: "銀行名稱、賬號同姓名不可以為空",
          ms: "Nama bank, nombor akaun dan nama tidak boleh kosong",
          id: "Nama bank, nomor rekening dan nama tidak boleh kosong",
        },
      });
    }

    const normalizedName = name.toLowerCase();
    const user = await User.findOne({ fullname: normalizedName });

    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
          zh_hk: "搵唔到用戶",
          ms: "Pengguna tidak dijumpai",
          id: "Pengguna tidak ditemukan",
        },
      });
    }

    if (user.bankAccounts.length >= 1) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Maximum 1 bank accounts allowed",
          zh: "最多只能添加1个银行账户",
          zh_hk: "最多只可以新增1個銀行賬戶",
          ms: "Maksimum 1 akaun bank dibenarkan",
          id: "Maksimal 1 rekening bank diizinkan",
        },
      });
    }

    const usersWithSameBank = await User.find({
      "bankAccounts.banknumber": banknumber,
    });
    const isDuplicateBank = usersWithSameBank.length > 0;
    user.bankAccounts.push({ name, bankname, banknumber });
    if (isDuplicateBank) {
      user.duplicateBank = true;
    }
    await user.save();

    res.json({
      success: true,
      message: {
        en: "Bank account added successfully",
        zh: "银行账户添加成功",
        zh_hk: "銀行賬戶新增成功",
        ms: "Akaun bank berjaya ditambah",
        id: "Rekening bank berhasil ditambahkan",
      },
    });
  } catch (error) {
    console.error("Error in addbank API:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
        zh_hk: "伺服器內部錯誤",
        ms: "Ralat dalaman pelayan",
        id: "Kesalahan server internal",
      },
    });
  }
});

// Admin Get Same User Bank Number
router.get(
  "/admin/api/users/find-by-bank/:banknumber",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { banknumber } = req.params;
      const trimmedBanknumber = banknumber.trim();
      const users = await User.find(
        {
          "bankAccounts.banknumber": { $exists: true },
        },
        {
          username: 1,
          fullname: 1,
          bankAccounts: 1,
          _id: 0,
        }
      );
      const matchedUsers = users.filter((user) =>
        user.bankAccounts.some(
          (account) =>
            account.banknumber &&
            account.banknumber.toString().trim() === trimmedBanknumber
        )
      );
      if (!matchedUsers || matchedUsers.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          message: "No users found with this bank number",
        });
      }
      const formattedUsers = matchedUsers.map((user) => {
        const matchingBankAccounts = user.bankAccounts.filter(
          (account) =>
            account.banknumber &&
            account.banknumber.toString().trim() === trimmedBanknumber
        );
        return {
          username: user.username,
          fullname: user.fullname,
          bankAccounts: matchingBankAccounts,
        };
      });
      return res.status(200).json({
        success: true,
        data: formattedUsers,
        message: `Found ${matchedUsers.length} user(s) with bank number: ${trimmedBanknumber}`,
      });
    } catch (error) {
      console.error("Error finding users by bank number:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Get User Bank
router.get("/api/getbank", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("bankAccounts");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    res.json({
      success: true,
      data: user.bankAccounts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Delete User Bank
router.delete("/api/userbank", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bankAccountId } = req.body;
    const result = await User.updateOne(
      { _id: userId },
      { $pull: { bankAccounts: { _id: bankAccountId } } }
    );
    if (result.matchedCount === 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }
    res.status(200).json({
      success: true,
      message: {
        en: "Bank account deleted successfully",
        zh: "银行账户已成功删除",
      },
    });
  } catch (error) {
    console.error("Error deleting bank account:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to delete bank account",
        zh: "删除银行账户失败",
      },
    });
  }
});

async function checkAndUpdateVIPLevel(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, message: "User not found" };
    }
    const vipSettings = await vip.findOne({});
    if (
      !vipSettings ||
      !vipSettings.vipLevels ||
      vipSettings.vipLevels.length === 0
    ) {
      return { success: false, message: "VIP settings not found" };
    }
    const totalDeposit = user.totaldeposit;
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
      return depositB - depositA;
    });
    let newLevel = null;
    for (const level of sortedVipLevels) {
      let requiredDeposit = 0;
      if (level.benefits instanceof Map) {
        requiredDeposit = parseFloat(level.benefits.get("Total Deposit") || 0);
      } else {
        requiredDeposit = parseFloat(level.benefits["Total Deposit"] || 0);
      }
      if (totalDeposit >= requiredDeposit) {
        newLevel = level.name;
        break;
      }
    }
    if (newLevel && newLevel !== user.viplevel) {
      const oldLevel = user.viplevel;
      user.viplevel = newLevel;
      await user.save();
      return {
        success: true,
        message: "VIP level updated",
        oldLevel,
        newLevel,
      };
    }
    return {
      success: true,
      message: "VIP level checked, no update needed",
      currentLevel: user.viplevel,
    };
  } catch (error) {
    return {
      success: false,
      message: "Internal server error",
      error: error.message,
    };
  }
}

function preventDuplicate(getKey) {
  return async (req, res, next) => {
    const key = getKey(req);
    try {
      await Lock.create({ key });
      res.on("finish", async () => {
        await Lock.deleteOne({ key }).catch(() => {});
      });

      next();
    } catch (error) {
      if (error.code === 11000) {
        return res.status(200).json({
          success: false,
          message: {
            en: "This request is already being processed, please wait",
            zh: "此请求正在处理中，请稍候",
          },
        });
      }
      next();
    }
  };
}

// Admin Approve Deposit
router.post(
  "/admin/api/approvedeposit/:depositId",
  authenticateAdminToken,
  preventDuplicate((req) => `deposit-${req.params.depositId}`),
  async (req, res) => {
    const { depositId } = req.params;
    const { depositname } = req.body;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const deposit = await Deposit.findById(depositId);
      if (!deposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit record not found",
            zh: "找不到存款记录",
          },
        });
      }
      if (deposit.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit has been processed or status is incorrect",
            zh: "存款已处理或状态不正确",
          },
        });
      }
      const user = await User.findOne({ username: deposit.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      const isAutoDeposit = deposit.method === "auto";

      let bank = null;
      if (!isAutoDeposit) {
        bank = await BankList.findById(deposit.bankid);

        if (!bank) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Bank not found",
              zh: "找不到银行",
            },
          });
        }
      }

      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance(
          "subtract",
          deposit.amount,
          {
            username: user.username,
            transactionType: "deposit approval",
            remark: `Deposit ID: ${deposit._id}`,
            processBy: adminuser.username,
          }
        );
        if (!kioskResult.success) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to update kiosk balance",
              zh: "更新Kiosk余额失败",
            },
          });
        }
      }

      const formattedProcessTime = calculateProcessingTime(deposit.createdAt);
      if (user.firstDepositDate === null) {
        deposit.newDeposit = true;
      }

      deposit.status = "approved";
      deposit.processBy = adminuser.username;
      deposit.processtime = formattedProcessTime;
      if (depositname) {
        deposit.depositname = depositname;
      }
      await deposit.save();

      // const spinSetting = await LuckySpinSetting.findOne();
      // if (spinSetting) {
      //   const spinCount = Math.floor(
      //     deposit.amount / spinSetting.depositAmount
      //   );
      //   if (spinCount > 0) {
      //     user.luckySpinCount = (user.luckySpinCount || 0) + spinCount;
      //   }
      // }

      const updateFields = {
        $inc: {
          totaldeposit: deposit.amount,
          wallet: deposit.amount,
        },
        $set: {
          lastdepositdate: new Date(),
          ...(user.firstDepositDate === null && {
            firstDepositDate: deposit.createdAt,
          }),
        },
      };

      await User.findByIdAndUpdate(user._id, updateFields);

      await checkAndUpdateVIPLevel(user._id);

      const walletLog = await UserWalletLog.findOne({
        transactionid: deposit.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "approved";
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the deposit.");
      }

      // bank.totalDeposits += deposit.amount;
      // bank.currentbalance =
      //   bank.startingbalance +
      //   bank.totalDeposits -
      //   bank.totalWithdrawals +
      //   bank.totalCashIn -
      //   bank.totalCashOut;
      // await bank.save();

      if (!isAutoDeposit && bank) {
        const updatedBank = await BankList.findByIdAndUpdate(
          deposit.bankid,
          [
            {
              $set: {
                totalDeposits: { $add: ["$totalDeposits", deposit.amount] },
                currentbalance: {
                  $subtract: [
                    {
                      $add: [
                        "$startingbalance",
                        { $add: ["$totalDeposits", deposit.amount] },
                        "$totalCashIn",
                      ],
                    },
                    {
                      $add: ["$totalWithdrawals", "$totalCashOut"],
                    },
                  ],
                },
              },
            },
          ],
          { new: true }
        );

        const depositLog = new BankTransactionLog({
          bankName: bank.bankname,
          ownername: bank.ownername,
          bankAccount: bank.bankaccount,
          remark: deposit.remark,
          lastBalance: updatedBank.currentbalance - deposit.amount,
          currentBalance: updatedBank.currentbalance,
          processby: adminuser.username,
          qrimage: bank.qrimage,
          playerusername: user.username,
          playerfullname: user.fullname,
          transactiontype: deposit.transactionType,
          amount: deposit.amount,
        });
        await depositLog.save();
      }

      await updateAverageProcessingTime(
        adminuser.username,
        deposit.processtime,
        "deposit"
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Deposit approved successfully, wallet balance updated",
          zh: "存款已成功批准，钱包余额已更新",
        },
      });
    } catch (error) {
      console.error("Error occurred while approving deposit:", error);
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

// Admin Approve Withdraw
router.post(
  "/admin/api/approvewithdraw/:withdrawId",
  authenticateAdminToken,
  preventDuplicate((req) => `withdraw-${req.params.withdrawId}`),
  async (req, res) => {
    const { withdrawId } = req.params;
    const { bankId, cashoutAmount } = req.body;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const withdraw = await Withdraw.findById(withdrawId);
      if (!withdraw) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdraw record not found",
            zh: "找不到提款记录",
          },
        });
      }
      if (withdraw.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdraw has been processed or status is incorrect",
            zh: "提款已处理或状态不正确",
          },
        });
      }
      const bank = await BankList.findById(bankId);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank not found",
            zh: "找不到银行",
          },
        });
      }
      const actualWithdrawAmount =
        cashoutAmount && cashoutAmount > 0
          ? withdraw.amount - cashoutAmount
          : withdraw.amount;
      if (actualWithdrawAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid withdraw amount after cashout adjustment",
            zh: "调整后的提款金额无效",
          },
        });
      }
      if (bank.currentbalance < actualWithdrawAmount) {
        return res.status(200).json({
          success: false,
          message: {
            en: "The bank's current balance is insufficient to cover this withdrawal",
            zh: "银行当前余额不足以支付此提款",
          },
        });
      }
      const user = await User.findOne({ username: withdraw.username });
      const formattedProcessTime = calculateProcessingTime(withdraw.createdAt);
      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance(
          "add",
          actualWithdrawAmount,
          {
            username: user.username,
            transactionType: "withdraw approval",
            remark: `Withdraw ID: ${withdraw._id}`,
            processBy: adminuser.username,
          }
        );
        if (!kioskResult.success) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to update kiosk balance",
              zh: "更新Kiosk余额失败",
            },
          });
        }
      }
      // bank.totalWithdrawals += actualWithdrawAmount;
      // bank.currentbalance =
      //   bank.startingbalance +
      //   bank.totalDeposits -
      //   bank.totalWithdrawals +
      //   bank.totalCashIn -
      //   bank.totalCashOut;
      // await bank.save();

      const updatedBank = await BankList.findByIdAndUpdate(
        bankId,
        [
          {
            $set: {
              totalWithdrawals: {
                $add: ["$totalWithdrawals", actualWithdrawAmount],
              },
              currentbalance: {
                $subtract: [
                  {
                    $add: [
                      "$startingbalance",
                      "$totalDeposits",
                      "$totalCashIn",
                    ],
                  },
                  {
                    $add: [
                      { $add: ["$totalWithdrawals", actualWithdrawAmount] },
                      "$totalCashOut",
                    ],
                  },
                ],
              },
            },
          },
        ],
        { new: true }
      );
      if (cashoutAmount && cashoutAmount > 0) {
        withdraw.remark = `Original Amount: ${withdraw.amount}\nCashout: ${cashoutAmount}\nActual Withdraw: ${actualWithdrawAmount}`;
      }
      withdraw.amount = actualWithdrawAmount;
      withdraw.status = "approved";
      withdraw.processBy = adminuser.username;
      withdraw.processtime = formattedProcessTime;
      withdraw.withdrawbankid = bankId;
      await withdraw.save();
      const walletLog = await UserWalletLog.findOne({
        transactionid: withdraw.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "approved";
        walletLog.amount = actualWithdrawAmount;
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the Withdraw.");
      }
      await User.findByIdAndUpdate(user._id, {
        $inc: { totalwithdraw: actualWithdrawAmount },
      });
      const withdrawLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        remark: withdraw.remark,
        lastBalance: updatedBank.currentbalance + actualWithdrawAmount,
        currentBalance: updatedBank.currentbalance,
        processby: adminuser.username,
        qrimage: bank.qrimage,
        playerusername: user.username,
        playerfullname: user.fullname,
        transactiontype: withdraw.transactionType,
        amount: actualWithdrawAmount,
      });
      await withdrawLog.save();

      await updateAverageProcessingTime(
        adminuser.username,
        withdraw.processtime,
        "withdrawal"
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Withdrawal approved successfully",
          zh: "提款已成功批准",
        },
      });
    } catch (error) {
      console.error("Error occurred while approving withdrawal:", error);
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

// Admin Approve Bonus
router.post(
  "/admin/api/approvebonus/:bonusId",
  authenticateAdminToken,
  preventDuplicate((req) => `bonus-${req.params.bonusId}`),
  async (req, res) => {
    const { bonusId } = req.params;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }

    try {
      const bonus = await Bonus.findById(bonusId);
      if (!bonus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus record not found",
            zh: "找不到奖金记录",
          },
        });
      }
      if (bonus.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus has been processed or status is incorrect",
            zh: "奖金已处理或状态不正确",
          },
        });
      }
      const user = await User.findOne({ username: bonus.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance("subtract", bonus.amount, {
          username: user.username,
          transactionType: "bonus approval",
          remark: `Bonus ID: ${bonus._id}`,
          processBy: adminuser.username,
        });

        if (!kioskResult.success) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to update kiosk balance",
              zh: "更新Kiosk余额失败",
            },
          });
        }
      }

      const formattedProcessTime = calculateProcessingTime(bonus.createdAt);

      bonus.status = "approved";
      bonus.processBy = adminuser.username;
      bonus.processtime = formattedProcessTime;
      await bonus.save();

      const updateFields = {
        $inc: {
          totalbonus: bonus.amount,
          wallet: bonus.amount,
        },
        $set: {
          ...(bonus.isLuckySpin && { luckySpinClaim: true }),
          ...(bonus.isCheckinBonus && { lastcheckinbonus: new Date() }),
        },
      };

      await User.findByIdAndUpdate(user._id, updateFields);
      const walletLog = await UserWalletLog.findOne({
        transactionid: bonus.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "approved";
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the bonus.");
      }

      await updateAverageProcessingTime(
        adminuser.username,
        bonus.processtime,
        "bonus"
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Bonus approved successfully, wallet balance updated",
          zh: "奖金已成功批准，钱包余额已更新",
        },
      });
    } catch (error) {
      console.error("Error occurred while approving bonus:", error);
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

// Admin Reject Deposit
router.post(
  "/admin/api/rejectdeposit/:depositId",
  authenticateAdminToken,
  preventDuplicate((req) => `deposit-${req.params.depositId}`),
  async (req, res) => {
    const { depositId } = req.params;
    const { rejectRemark } = req.body;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const deposit = await Deposit.findById(depositId);
      if (!deposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit record not found",
            zh: "找不到存款记录",
          },
        });
      }
      if (deposit.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit has been processed or status is incorrect",
            zh: "存款已处理或状态不正确",
          },
        });
      }

      const isAutoDeposit = deposit.method === "auto";

      const formattedProcessTime = calculateProcessingTime(deposit.createdAt);

      deposit.status = "rejected";
      deposit.processBy = adminuser.username;
      deposit.processtime = formattedProcessTime;
      deposit.remark = rejectRemark;
      await deposit.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: deposit.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "rejected";
        walletLog.promotionnameEN = rejectRemark;
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the deposit.");
      }

      await updateAverageProcessingTime(
        adminuser.username,
        deposit.processtime,
        "deposit"
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Deposit rejected successfully",
          zh: "存款已成功拒绝",
        },
      });
    } catch (error) {
      console.error("Error occurred while rejecting deposit:", error);
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

// Admin Reject Withdraw
router.post(
  "/admin/api/rejectwithdraw/:withdrawId",
  authenticateAdminToken,
  preventDuplicate((req) => `withdraw-${req.params.withdrawId}`),
  async (req, res) => {
    const { withdrawId } = req.params;
    const { rejectRemark } = req.body;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const withdraw = await Withdraw.findById(withdrawId);
      if (!withdraw) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal record not found",
            zh: "找不到提款记录",
          },
        });
      }

      if (withdraw.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal has been processed or status is incorrect",
            zh: "提款已处理或状态不正确",
          },
        });
      }

      const user = await User.findOne({ username: withdraw.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      const formattedProcessTime = calculateProcessingTime(withdraw.createdAt);

      user.wallet += withdraw.amount;
      await user.save();

      withdraw.status = "rejected";
      withdraw.processBy = adminuser.username;
      withdraw.processtime = formattedProcessTime;
      withdraw.remark = rejectRemark;
      await withdraw.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: withdraw.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "rejected";
        walletLog.promotionnameEN = rejectRemark;
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the Withdraw.");
      }

      await updateAverageProcessingTime(
        adminuser.username,
        withdraw.processtime,
        "withdrawal"
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Withdrawal rejected successfully, wallet balance updated",
          zh: "提款已成功拒绝，钱包余额已更新",
        },
      });
    } catch (error) {
      console.error("Error occurred while rejecting withdrawal:", error);
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

// Admin Reject Bonus
router.post(
  "/admin/api/rejectbonus/:bonusId",
  authenticateAdminToken,
  preventDuplicate((req) => `bonus-${req.params.bonusId}`),
  async (req, res) => {
    const { bonusId } = req.params;
    const { rejectRemark } = req.body;
    const userId = req.user.userId;
    const adminuser = await adminUser.findById(userId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "未找到管理员用户，请联系客户服务",
        },
      });
    }
    try {
      const bonus = await Bonus.findById(bonusId);
      if (!bonus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus record not found",
            zh: "找不到奖金记录",
          },
        });
      }
      if (bonus.status !== "pending") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus has been processed or status is incorrect",
            zh: "奖金已处理或状态不正确",
          },
        });
      }

      const formattedProcessTime = calculateProcessingTime(bonus.createdAt);

      bonus.status = "rejected";
      bonus.processBy = adminuser.username;
      bonus.processtime = formattedProcessTime;
      bonus.remark = rejectRemark;
      await bonus.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: bonus.transactionId,
        status: "pending",
      });

      if (walletLog) {
        walletLog.status = "rejected";
        walletLog.promotionnameEN = rejectRemark;
        await walletLog.save();
      } else {
        console.error("UserWalletLog record not found for the bonus.");
      }
      await updateAverageProcessingTime(
        adminuser.username,
        bonus.processtime,
        "bonus"
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Bonus rejected successfully",
          zh: "奖金已成功拒绝",
        },
      });
    } catch (error) {
      console.error("Error occurred while rejecting bonus:", error);
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

// Admin Revert Deposit
router.post(
  "/admin/api/revertdeposit/:depositId",
  authenticateAdminToken,
  preventDuplicate((req) => `deposit-${req.params.depositId}`),
  async (req, res) => {
    try {
      const { depositId } = req.params;
      const userId = req.user.userId;
      const adminuser = await adminUser.findById(userId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }

      const deposit = await Deposit.findById(depositId);
      if (!deposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit record not found",
            zh: "找不到存款记录",
          },
        });
      }

      if (deposit.status !== "approved" || deposit.reverted) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Unable to revert this deposit",
            zh: "无法撤销此存款",
          },
        });
      }

      const user = await User.findOne({ username: deposit.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      const isFromWallet = deposit.bankname === "User Wallet";
      const kioskAmount = deposit.amount;
      const bankAmount = deposit.bankAmount || kioskAmount;
      const saveToWalletAmount = bankAmount - kioskAmount;

      let bank = null;
      if (!isFromWallet && deposit.method !== "auto") {
        bank = await BankList.findById(deposit.bankid);
        if (!bank) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Bank account not found",
              zh: "找不到银行账户",
            },
          });
        }
      }

      if (deposit.newDeposit === true) {
        user.firstDepositDate = null;
        deposit.newDeposit = false;
      }

      if (user.lastdepositdate) {
        const previousDeposit = await Deposit.findOne({
          userId: user._id,
          status: "approved",
          reverted: { $ne: true },
          _id: { $ne: deposit._id },
        }).sort({ createdAt: -1 });

        user.lastdepositdate = previousDeposit
          ? previousDeposit.createdAt
          : null;
      }

      user.totaldeposit -= kioskAmount;

      if (isFromWallet) {
        user.wallet = Number(user.wallet) + Number(kioskAmount);
      }

      if (saveToWalletAmount > 0) {
        user.wallet = Number(user.wallet) - saveToWalletAmount;
      }

      await user.save();
      await checkAndUpdateVIPLevel(user._id);

      if (!isFromWallet && deposit.method !== "auto" && bank) {
        bank.currentbalance -= bankAmount;
        bank.totalDeposits -= bankAmount;
        await bank.save();
      }

      deposit.reverted = true;
      deposit.status = "reverted";
      deposit.revertedProcessBy = adminuser.username;
      await deposit.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: deposit.transactionId,
      });
      if (walletLog) {
        walletLog.status = "cancel";
        await walletLog.save();
      }

      adminuser.totalRevertedDeposits += 1;
      await adminuser.save();

      if (!isFromWallet && deposit.method !== "auto" && bank) {
        const transactionLog = new BankTransactionLog({
          bankName: bank.bankname,
          ownername: bank.ownername,
          bankAccount: bank.bankaccount,
          remark: deposit.remark || "-",
          lastBalance: bank.currentbalance + bankAmount,
          currentBalance: bank.currentbalance,
          processby: adminuser.username,
          transactiontype: "reverted deposit",
          amount: bankAmount,
          qrimage: bank.qrimage,
          userid: user.userid,
          playerusername: user.username,
          playerfullname: user.fullname,
        });
        await transactionLog.save();
      }

      res.status(200).json({
        success: true,
        message: {
          en: "Deposit successfully reverted",
          zh: "存款已成功撤销",
        },
      });
    } catch (error) {
      console.error("Error during deposit reversion:", error);
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

// Admin Revert Withdraw
router.post(
  "/admin/api/revertwithdraw/:withdrawId",
  authenticateAdminToken,
  preventDuplicate((req) => `withdraw-${req.params.withdrawId}`),
  async (req, res) => {
    try {
      const { withdrawId } = req.params;
      const userId = req.user.userId;
      const adminuser = await adminUser.findById(userId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }

      const withdraw = await Withdraw.findById(withdrawId);
      if (!withdraw) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal record not found",
            zh: "找不到提款记录",
          },
        });
      }

      if (withdraw.status !== "approved" || withdraw.reverted) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Unable to revert this withdrawal",
            zh: "无法撤销此提款",
          },
        });
      }

      const user = await User.findOne({ username: withdraw.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      const kioskAmount = Number(withdraw.amount) || 0;
      const bankAmount = Number(withdraw.bankAmount) || kioskAmount;
      const walletAmount = bankAmount - kioskAmount;

      const isToWallet = withdraw.bankname === "User Wallet";

      if (isToWallet) {
        await User.findByIdAndUpdate(user._id, {
          $inc: {
            totalwithdraw: -kioskAmount,
            wallet: -kioskAmount,
          },
        });
      } else {
        const bank = await BankList.findById(withdraw.bankid);
        if (!bank) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Bank account not found",
              zh: "找不到银行账户",
            },
          });
        }

        const userUpdate = {
          $inc: {
            totalwithdraw: -kioskAmount,
          },
        };
        if (walletAmount > 0) {
          userUpdate.$inc.wallet = walletAmount;
        }
        await User.findByIdAndUpdate(user._id, userUpdate);

        await BankList.findByIdAndUpdate(bank._id, {
          $inc: {
            currentbalance: bankAmount,
            totalWithdrawals: -bankAmount,
          },
        });

        const updatedBank = await BankList.findById(bank._id);
        const transactionLog = new BankTransactionLog({
          bankName: bank.bankname,
          ownername: bank.ownername,
          bankAccount: bank.bankaccount,
          remark:
            walletAmount > 0
              ? `${
                  withdraw.remark || "-"
                } | Reverted (Kiosk: ${kioskAmount}, Wallet: ${walletAmount})`
              : withdraw.remark || "-",
          lastBalance: updatedBank.currentbalance - bankAmount,
          currentBalance: updatedBank.currentbalance,
          processby: adminuser.username,
          transactiontype: "reverted withdraw",
          amount: bankAmount,
          qrimage: bank.qrimage,
          userid: user.userid,
          playerusername: user.username,
          playerfullname: user.fullname,
        });
        await transactionLog.save();

        const feesLog = await BankTransactionLog.findOne({
          remark: {
            $regex: `Transaction fees for withdraw ${withdraw.transactionId}`,
          },
          transactiontype: "transactionfee",
        });

        if (feesLog) {
          const feesAmount = Number(feesLog.amount) || 0;
          await BankList.findByIdAndUpdate(bank._id, {
            $inc: {
              currentbalance: feesAmount,
              totalTransactionFees: -feesAmount,
            },
          });
          const updatedBankAfterFeesRevert = await BankList.findById(bank._id);
          const revertFeesLog = new BankTransactionLog({
            transactionId: uuidv4(),
            bankName: bank.bankname,
            ownername: bank.ownername,
            bankAccount: bank.bankaccount,
            remark: `Reverted transaction fees for withdraw ${withdraw.transactionId}`,
            lastBalance: updatedBankAfterFeesRevert.currentbalance - feesAmount,
            currentBalance: updatedBankAfterFeesRevert.currentbalance,
            processby: adminuser.username,
            qrimage: bank.qrimage,
            userid: user.userid,
            playerusername: user.username,
            playerfullname: user.fullname,
            transactiontype: "reverted transactionfee",
            amount: feesAmount,
          });
          await revertFeesLog.save();
        }
      }

      withdraw.reverted = true;
      withdraw.status = "reverted";
      withdraw.revertedProcessBy = adminuser.username;
      await withdraw.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: withdraw.transactionId,
      });
      if (walletLog) {
        walletLog.status = "cancel";
        await walletLog.save();
      }

      adminuser.totalRevertedWithdrawals += 1;
      await adminuser.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Withdrawal successfully reverted",
          zh: "提款已成功撤销",
        },
      });
    } catch (error) {
      console.error("Error during withdrawal reversion:", error);
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

//Admin Revert Bonus
router.post(
  "/admin/api/revertbonus/:bonusId",
  authenticateAdminToken,
  preventDuplicate((req) => `bonus-${req.params.bonusId}`),
  async (req, res) => {
    try {
      const { bonusId } = req.params;
      const userId = req.user.userId;
      const adminuser = await adminUser.findById(userId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const bonus = await Bonus.findById(bonusId);
      if (!bonus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bonus record not found",
            zh: "找不到奖金记录",
          },
        });
      }
      if (bonus.status !== "approved" || bonus.reverted) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Unable to revert this bonus",
            zh: "无法撤销此奖金",
          },
        });
      }
      const user = await User.findOne({ username: bonus.username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      user.totalbonus -= bonus.amount;
      await user.save();

      bonus.reverted = true;
      bonus.status = "reverted";
      bonus.revertedProcessBy = adminuser.username;
      await bonus.save();

      const walletLog = await UserWalletLog.findOne({
        transactionid: bonus.transactionId,
      });
      if (walletLog) {
        walletLog.status = "cancel";
        await walletLog.save();
      }

      adminuser.totalRevertedBonuses += 1;
      await adminuser.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Bonus successfully reverted",
          zh: "奖金已成功撤销",
        },
      });
    } catch (error) {
      console.error("Error during bonus reversion:", error);
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

// Admin Search User
router.get(
  "/admin/api/search/:username",
  authenticateAdminToken,
  async (req, res) => {
    try {
      let username = req.params.username;
      const user = await User.findOne({ username: username });
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        data: {
          _id: user._id,
          username: user.username,
          balance: user.wallet,
          viplevel: user.viplevel,
          email: user.email,
          fullname: user.fullname,
        },
      });
    } catch (error) {
      console.error("Error searching user:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error during user search",
          zh: "搜索用户时出错",
        },
      });
    }
  }
);

// Admin Get Specific User Bank Accounts
router.get(
  "/admin/api/user/bankaccounts/:username",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const username = req.params.username;
      const user = await User.findOne({ username }).select("bankAccounts");
      if (!user || !user.bankAccounts) {
        return res.status(200).json({
          success: false,
          message: "No bank accounts found for this user",
        });
      }
      res.status(200).json({
        success: true,
        data: user.bankAccounts,
      });
    } catch (error) {
      console.error("Error fetching user bank accounts:", error);
      res.status(200).json({
        success: false,
        message: "Error fetching bank accounts",
      });
    }
  }
);

// Admin Get ALl Users
router.get("/admin/api/allusers", authenticateAdminToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const sortKey = req.query.sortKey || "createdAt";
    const sortOrder = req.query.sortOrder || "desc";
    const skip = (page - 1) * limit;

    const query = search
      ? {
          $or: [
            { username: new RegExp(search, "i") },
            { fullname: new RegExp(search, "i") },
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: "$phonenumber" },
                  regex: search,
                  options: "i",
                },
              },
            },
            ...(isNaN(search) ? [] : [{ userid: parseInt(search) }]),
          ],
        }
      : {};

    const sortKeyMap = {
      userid: "userid",
      vipLevel: "viplevel",
      username: "username",
      fullname: "fullname",
      wallet: "walletAmount",
      wallettwo: "walletTwoAmount",
      verified: "isVerified",
      creationDate: "createdAt",
      lastLoginDate: "lastLogin",
      status: "status",
      totalDeposit: "totaldeposit",
      totalWithdraw: "totalwithdraw",
      totalBonus: "totalbonus",
      winLose: "winlose",
    };

    // Optimized aggregation pipeline
    const pipeline = [
      // Match stage first for better performance
      { $match: query },

      // Computed fields stage
      {
        $addFields: {
          isVerified: {
            $or: ["$isPhoneVerified", "$isEmailVerified"],
          },
        },
      },

      {
        $addFields: {
          winlose: {
            $subtract: ["$totaldeposit", "$totalwithdraw"],
          },
          walletAmount: {
            $toDouble: "$wallet",
          },
          walletTwoAmount: {
            $toDouble: "$wallettwo",
          },
        },
      },

      // Sorting stage
      {
        $sort: (() => {
          if (sortKey === "verified") {
            return {
              isVerified: sortOrder === "asc" ? 1 : -1,
              createdAt: -1,
            };
          }
          if (sortKey === "wallet") {
            return {
              walletAmount: sortOrder === "asc" ? 1 : -1,
              _id: 1,
            };
          }
          if (sortKey === "wallettwo") {
            return {
              walletTwoAmount: sortOrder === "asc" ? 1 : -1,
              _id: 1,
            };
          }
          if (sortKey === "creationDate" || sortKey === "lastLoginDate") {
            const field = sortKeyMap[sortKey];
            return {
              [field]: sortOrder === "asc" ? 1 : -1,
              _id: 1, // Secondary sort for consistency
            };
          }

          return {
            [sortKeyMap[sortKey] || "createdAt"]: sortOrder === "asc" ? 1 : -1,
            _id: 1,
          };
        })(),
      },

      // Pagination
      { $skip: skip },
      { $limit: limit },

      // Project only needed fields
      {
        $project: {
          _id: 1,
          userid: 1,
          username: 1,
          fullname: 1,
          viplevel: 1,
          isPhoneVerified: 1,
          isEmailVerified: 1,
          phonenumber: 1,
          createdAt: 1,
          lastLogin: 1,
          lastLoginIp: 1,
          status: 1,
          duplicateIP: 1,
          isVerified: 1,
          totaldeposit: 1,
          totalwithdraw: 1,
          totalbonus: 1,
          winlose: 1,
          wallet: "$walletAmount",
          wallettwo: "$walletTwoAmount",
          bankAccounts: 1,
        },
      },
    ];

    const [users, totalUsers] = await Promise.all([
      User.aggregate(pipeline).allowDiskUse(true).exec(),
      User.countDocuments(query).lean(),
    ]);

    const totalPages = Math.ceil(totalUsers / limit);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          totalPages,
          totalUsers,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching all users",
      error: error.message,
    });
  }
});

// Admin Register User
router.post(
  "/admin/api/registeruser",
  authenticateAdminToken,
  async (req, res) => {
    const {
      username,
      fullname,
      email,
      dob,
      password,
      phoneNumbers = [],
      bankAccounts = [],
      referralCode,
      freeCreditApply,
    } = req.body;
    if (!fullname || !phoneNumbers.length) {
      return res.status(200).json({
        success: false,
        message: {
          en: "All fields are required",
          zh: "所有字段都是必填的",
        },
      });
    }
    const normalizedUsername = fullname.toLowerCase().replace(/\s+/g, "");
    const normalizedFullname = fullname.toLowerCase().replace(/\s+/g, "");
    const formattedPhoneNumbers = phoneNumbers.map((phone) => {
      const phoneStr = String(phone);
      if (phoneStr.length === 8) {
        return `675${phoneStr}`;
      }
      return phoneStr;
    });
    const primaryPhone = formattedPhoneNumbers[0];
    try {
      const existingUser = await User.findOne({
        $or: [{ fullname: new RegExp(`^${normalizedFullname}$`, "i") }],
      });
      if (existingUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Duplicate User",
            zh: "用户已存在",
          },
        });
      }
      const existingPhoneNumber = await User.findOne({
        $or: [
          { phonenumber: { $in: formattedPhoneNumbers } },
          { phoneNumbers: { $in: formattedPhoneNumbers } },
        ],
      });
      if (existingPhoneNumber) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Duplicate Phone Number",
            zh: "电话号码已存在",
          },
        });
      }
      const generalSettings = await general.findOneAndUpdate(
        {},
        { $inc: { userIdCounter: 1 } },
        { sort: { createdAt: -1 }, new: true }
      );
      if (!generalSettings) {
        return res.status(200).json({
          success: false,
          message: {
            en: "System not configured. Please set up general settings first.",
            zh: "系统未配置，请先设置通用设置。",
          },
        });
      }
      const newUserId = generalSettings.userIdCounter;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const newReferralCode = await generateUniqueReferralCode();
      const referralLink = generateReferralLink(newReferralCode);
      const referralQrCode = await generateQRWithLogo(referralLink);
      let referralBy = null;
      if (referralCode) {
        const referrer = await User.findOne({ referralCode: referralCode });
        if (referrer) {
          referralBy = {
            user_id: referrer._id,
            username: referrer.username,
          };
        }
      }

      const newUser = await User.create({
        userid: newUserId,
        username: normalizedUsername,
        fullname: normalizedFullname,
        email,
        dob,
        password: hashedPassword,
        phonenumber: primaryPhone,
        phoneNumbers: formattedPhoneNumbers,
        bankAccounts,
        registerIp: "admin register",
        referralLink,
        referralCode: newReferralCode,
        referralQrCode,
        viplevel: null,
        gameId: await generateUniqueGameId(),
        referralBy,
      });
      addContactToGoogle(newUserId, fullname, formattedPhoneNumbers, "");
      if (referralBy) {
        await User.findByIdAndUpdate(referralBy.user_id, {
          $push: {
            referrals: {
              user_id: newUser._id,
              username: newUser.username,
            },
          },
        });
      }

      const kiosks = await Kiosk.find({
        isActive: true,
        registerGameAPI: { $exists: true, $ne: "" },
      });

      const API_URL = process.env.API_URL || "http://localhost:3001/api/";

      for (const kiosk of kiosks) {
        try {
          const url = `${API_URL}${kiosk.registerGameAPI}/${newUser._id}`;
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: req.headers.authorization,
            },
            body: JSON.stringify({}),
          });
          const text = await response.text();
          try {
            const result = JSON.parse(text);
          } catch (parseError) {
            console.error(`[Register] ${kiosk.name} - Invalid JSON response`);
          }
        } catch (error) {
          console.error(`[Register] ${kiosk.name} error:`, error.message);
        }
      }

      if (freeCreditApply) {
        try {
          const selectedKiosk = await Kiosk.findOne({ name: /Kaya918/i });
          const freeCreditPromotion = await Promotion.findOne({
            $or: [
              { maintitleEN: { $regex: /Free Credit/i } },
              { maintitle: { $regex: /免费积分/ } },
            ],
          });

          if (selectedKiosk && freeCreditPromotion) {
            const bonusAmount = Number(freeCreditPromotion.bonusexact);
            const transferAmount = bonusAmount;

            // Step 1: Transfer In (bonusexact)
            const transferUrl = `${API_URL}${selectedKiosk.transferInAPI}/${newUser._id}`;
            const transferResponse = await fetch(transferUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: req.headers.authorization,
              },
              body: JSON.stringify({
                transferAmount: transferAmount,
              }),
            });
            const transferResult = await transferResponse.json();

            if (transferResult.success) {
              // Step 2: Create Bonus Record (正常 bonusexact)
              const transactionId = uuidv4();
              const adminuser = await adminUser.findById(req.user.userId);

              const newBonus = new Bonus({
                transactionId,
                userId: newUser._id,
                userid: newUser.userid,
                username: newUser.username,
                fullname: newUser.fullname,
                transactionType: "bonus",
                processBy: adminuser?.username || "system",
                amount: bonusAmount,
                walletamount: 0,
                status: "approved",
                method: "admin",
                remark: "Free Credit Apply",
                game: selectedKiosk.name,
                promotionname: freeCreditPromotion.maintitle,
                promotionnameEN: freeCreditPromotion.maintitleEN,
                promotionId: freeCreditPromotion._id,
                processtime: "0s",
              });
              await newBonus.save();

              await User.findByIdAndUpdate(newUser._id, {
                $inc: { totalbonus: bonusAmount },
              });

              const walletLog = new UserWalletLog({
                userId: newUser._id,
                transactionid: transactionId,
                transactiontime: new Date(),
                transactiontype: "bonus",
                amount: bonusAmount,
                status: "approved",
                remark: "Free Credit Apply",
                game: selectedKiosk.name,
                promotionnameCN: freeCreditPromotion.maintitle,
                promotionnameEN: freeCreditPromotion.maintitleEN,
              });
              await walletLog.save();
            }
          }
        } catch (error) {
          console.error("Free Credit Apply error:", error.message);
        }
      }
      res.status(200).json({
        success: true,
        message: {
          en: "User created successfully",
          zh: "用户创建成功",
        },
        data: {
          userid: newUserId,
          username: newUser.username,
        },
      });
    } catch (error) {
      console.error("Error occurred while creating user:", error);
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

// Admin Get Specific User Data
router.get(
  "/admin/api/user/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: "User not found",
        });
      }
      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error("Error fetching user details:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching user details",
        error: error.message,
      });
    }
  }
);

// Admin Update Specific User Data
router.put(
  "/admin/api/user/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const {
        fullname,
        email,
        phoneNumbers,
        dob,
        viplevel,
        luckySpinCount,
        totalturnover,
        positionTaking,
        referralByUsername,
      } = req.body;

      let formattedPhoneNumbers = [];
      let primaryPhone = null;
      if (phoneNumbers && phoneNumbers.length) {
        formattedPhoneNumbers = phoneNumbers
          .filter((p) => p && p.toString().trim() !== "")
          .map((phone) =>
            String(phone).startsWith("675") ? String(phone) : `675${phone}`
          );
        primaryPhone = formattedPhoneNumbers[0];
        const existingPhoneNumber = await User.findOne({
          _id: { $ne: userId },
          $or: [
            { phonenumber: { $in: formattedPhoneNumbers } },
            { phoneNumbers: { $in: formattedPhoneNumbers } },
          ],
        });

        if (existingPhoneNumber) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Duplicate Phone Number",
              zh: "电话号码已存在",
            },
          });
        }
      }
      const updateData = {
        fullname,
        email,
        dob,
        viplevel,
        luckySpinCount,
        totalturnover,
        positionTaking,
      };
      if (formattedPhoneNumbers.length) {
        updateData.phonenumber = primaryPhone;
        updateData.phoneNumbers = formattedPhoneNumbers;
      }
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();
      if (referralByUsername !== undefined) {
        const currentReferralBy = updatedUser.referralBy
          ? updatedUser.referralBy.username
          : null;
        if (currentReferralBy !== referralByUsername) {
          const referralResult = await updateUserReferral(
            userId,
            referralByUsername,
            adminuser.username,
            adminuser.fullname,
            clientIp
          );
          if (!referralResult.success) {
            return res.status(200).json(referralResult);
          }
        }
      }
      res.status(200).json({
        success: true,
        message: {
          en: "User information updated successfully",
          zh: "用户信息更新成功",
        },
        data: updatedUser,
      });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating user information",
          zh: "更新用户信息时出错",
        },
      });
    }
  }
);

// Admin Update User Password
router.put(
  "/admin/api/user/:userId/password",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Password must be at least 6 characters long",
            zh: "密码长度必须至少为6个字符",
          },
        });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: { password: hashedPassword },
        },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Password updated successfully",
          zh: "密码更新成功",
        },
      });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating password",
          zh: "更新密码时出错",
        },
      });
    }
  }
);

// Admnin Update User Status
router.put(
  "/admin/api/user/:userId/toggle-status",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const newStatus = user.status === true ? false : true;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: { status: newStatus },
        },
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: `User status updated to ${newStatus ? "active" : "inactive"}`,
          zh: `用户状态已更新为${newStatus ? "激活" : "禁用"}`,
        },
        status: newStatus,
      });
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating user status",
          zh: "更新用户状态时出错",
        },
      });
    }
  }
);

// Admin Update User Withdraw Lock
router.put(
  "/admin/api/user/:userId/toggle-withdraw-lock",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const newLockStatus = !user.withdrawlock;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: { withdrawlock: newLockStatus },
        },
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: newLockStatus
            ? "Withdraw lock for this user has been enabled"
            : "Withdraw lock for this user has been disabled",
          zh: newLockStatus
            ? "该用户的提款锁定已启用"
            : "该用户的提款锁定已禁用",
        },
      });
    } catch (error) {
      console.error("Error toggling withdraw lock:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating withdraw lock status",
          zh: "更新提款锁定状态时出错",
        },
      });
    }
  }
);

// Admin Update User Duplicate IP
router.put(
  "/admin/api/user/:userId/toggle-duplicate-ip",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const newDuplicateIPStatus = !user.duplicateIP;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: { duplicateIP: newDuplicateIPStatus },
        },
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: newDuplicateIPStatus
            ? "Duplicate IP status for this user has been enabled"
            : "Duplicate IP status for this user has been disabled",
          zh: newDuplicateIPStatus
            ? "该用户的重复IP状态已启用"
            : "该用户的重复IP状态已禁用",
        },
      });
    } catch (error) {
      console.error("Error toggling Duplicate IP status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating duplicate IP status",
          zh: "更新重复IP状态时出错",
        },
      });
    }
  }
);

// Admin Update User Remark
router.put(
  "/admin/api/user/:userId/remark",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const { remark } = req.body;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { remark } },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Remark updated successfully",
          zh: "备注更新成功",
        },
      });
    } catch (error) {
      console.error("Error updating remark:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating remark",
          zh: "更新备注时出错",
        },
      });
    }
  }
);

// Admin Add User Bank Account
router.post(
  "/admin/api/user/:userId/bank-accounts",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const { name, bankname, bankcode, banknumber } = req.body;
      if (!name || !bankname || !banknumber) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Please provide all required bank account details",
            zh: "请提供所有必需的银行账户详情",
          },
        });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      user.bankAccounts.push({
        name,
        bankcode,
        bankname,
        banknumber,
      });
      await user.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Bank account added successfully",
          zh: "银行账户添加成功",
        },
        data: user.bankAccounts,
      });
    } catch (error) {
      console.error("Error adding bank account:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error adding bank account",
          zh: "添加银行账户时出错",
        },
      });
    }
  }
);

// Admin Delete User Bank Account
router.delete(
  "/admin/api/user/:userId/bank-accounts/:bankId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId, bankId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const bankIndex = user.bankAccounts.findIndex(
        (bank) => bank._id.toString() === bankId
      );
      if (bankIndex === -1) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank account not found",
            zh: "找不到银行账户",
          },
        });
      }
      user.bankAccounts.splice(bankIndex, 1);
      await user.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Bank account deleted successfully",
          zh: "银行账户删除成功",
        },
        data: user.bankAccounts,
      });
    } catch (error) {
      console.error("Error deleting bank account:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error deleting bank account",
          zh: "删除银行账户时出错",
        },
      });
    }
  }
);

// Admin Get Active Bank Names
router.get(
  "/admin/api/activebanknames",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const activeBanks = await UserBankList.find(
        { isActive: true },
        "bankname"
      );
      res.json({
        success: true,
        data: activeBanks,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Admin Cashout User Wallet
router.patch(
  "/admin/api/user/cashout/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "找不到管理员用户，请联系客服",
          },
        });
      }
      const { amount, remark, kioskName } = req.body;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const newCashOut = new UserWalletCashOut({
        transactionId: uuidv4(),
        userId: user._id,
        userid: user.userid,
        username: user.username,
        fullname: user.fullname,
        method: "manual",
        transactionType: "user cashout",
        processBy: adminuser.username,
        amount: amount,
        status: "approved",
        remark: remark,
        game: kioskName,
      });
      await newCashOut.save();

      res.status(200).json({
        success: true,
        message: {
          en: "CashOut recorded successfully",
          zh: "扣除记录成功",
        },
      });
    } catch (error) {
      console.error("Error occurred while processing cashout:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error processing cashout",
          zh: "处理扣除时出错",
        },
      });
    }
  }
);

// Admin CAshin User Wallet
router.patch(
  "/admin/api/user/cashin/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "找不到管理员用户，请联系客服",
          },
        });
      }
      const { amount, remark, kioskName } = req.body;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const newCashIn = new UserWalletCashIn({
        transactionId: uuidv4(),
        userId: user._id,
        userid: user.userid,
        username: user.username,
        fullname: user.fullname,
        method: "manual",
        transactionType: "user cashin",
        processBy: adminuser.username,
        amount: amount,
        status: "approved",
        remark: remark,
        game: kioskName,
      });
      await newCashIn.save();
      res.status(200).json({
        success: true,
        message: {
          en: "CashIn recorded successfully",
          zh: "充值记录成功",
        },
      });
    } catch (error) {
      console.error("Error occurred while processing cashin:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error processing cashin",
          zh: "处理充值时出错",
        },
      });
    }
  }
);

// Admin Update User Rebate
router.patch(
  "/admin/api/user/:userId/updateRebate",
  authenticateAdminToken,
  async (req, res) => {
    const { userId } = req.params;
    const { rebate } = req.body;
    if (typeof rebate !== "number" || rebate < 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Invalid rebate amount",
          zh: "无效的返利金额",
        },
      });
    }
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      user.rebate = rebate;
      await user.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Rebate amount updated successfully",
          zh: "返利金额更新成功",
        },
        rebate: user.rebate,
      });
    } catch (error) {
      console.error("Error updating rebate amount:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating rebate amount",
          zh: "更新返利金额时出错",
        },
      });
    }
  }
);

// Admin Get User Wallet Transfer Log
router.get(
  "/admin/api/user/walletransferlog/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      const walletLogs = await adminUserWalletLog
        .find({ username: user.username })
        .sort({ createdAt: -1 });
      const processedLogs = walletLogs.map((log) => {
        let gameBalance = 0;
        const transferAmount = Math.abs(log.transferamount);
        if (log.transactiontype === "deposit") {
          gameBalance = log.userwalletbalance + transferAmount;
        }
        return {
          ...log.toObject(),
          gameBalance,
        };
      });

      // Return successful response
      res.status(200).json({
        success: true,
        message: "Wallet transfer logs retrieved successfully",
        data: processedLogs,
      });
    } catch (error) {
      console.error("Error retrieving wallet transfer logs:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve wallet transfer logs",
        error: error.message,
      });
    }
  }
);

// Admin Get User Logs
router.get("/admin/api/userlogs", authenticateAdminToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      };
    }
    const adminId = req.user.userId;
    const admin = await adminUser.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin user not found",
      });
    }
    const logs = await userLog
      .find({
        ...dateFilter,
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "User logs retrieved successfully",
      data: logs,
    });
  } catch (error) {
    console.error("Error retrieving user logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve user logs",
      error: error.message,
    });
  }
});

// Admin Get Specific User Wallet Logs
router.get(
  "/admin/api/userwalletlog/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;
      const filter = { userId: userId };
      if (startDate && endDate) {
        filter.createdAt = {
          $gte: moment(new Date(startDate)).startOf("day").utc().toDate(),
          $lte: moment(new Date(endDate)).endOf("day").utc().toDate(),
        };
      }
      const userwalletlog = await UserWalletLog.find(filter).sort({
        createdAt: -1,
      });
      res.status(200).json({
        success: true,
        message: "User Wallet Log retrieved successfully",
        data: userwalletlog,
      });
    } catch (error) {
      console.error("Error occurred while retrieving User Wallet Log:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
);

// Update TelegramId & FacebookId
router.post("/api/updateSocialMedia", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }
    const { telegramId, facebookId, email } = req.body;
    if (email !== undefined) {
      user.email = email;
    }
    if (telegramId !== undefined) {
      user.telegramId = telegramId;
    }
    if (facebookId !== undefined) {
      user.facebookId = facebookId;
    }
    await user.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Social media updated successfully",
        zh: "社交媒体更新成功",
      },
    });
  } catch (error) {
    console.error("Update social media error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Admin Get Summary Report
router.get(
  "/admin/api/summary-report",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }
      const [
        depositStats,
        withdrawStats,
        bonusStats,
        rebateStats,
        cashStats,
        newDepositCount,
        revertedStats,
        newRegistrations,
        userCashoutStats,
        userCashinStats,
      ] = await Promise.all([
        Deposit.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              bankname: { $ne: "User Wallet" },
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              depositQty: { $sum: 1 },
              totalDeposit: { $sum: { $ifNull: ["$bankAmount", "$amount"] } },
              uniquePlayers: { $addToSet: "$username" },
              totalProcessTime: {
                $sum: {
                  $add: [
                    {
                      $multiply: [
                        {
                          $convert: {
                            input: {
                              $arrayElemAt: [
                                { $split: ["$processtime", ":"] },
                                0,
                              ],
                            },
                            to: "int",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        3600,
                      ],
                    },
                    {
                      $multiply: [
                        {
                          $convert: {
                            input: {
                              $arrayElemAt: [
                                { $split: ["$processtime", ":"] },
                                1,
                              ],
                            },
                            to: "int",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        60,
                      ],
                    },
                    {
                      $convert: {
                        input: {
                          $arrayElemAt: [{ $split: ["$processtime", ":"] }, 2],
                        },
                        to: "int",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
        Withdraw.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              bankname: { $ne: "User Wallet" },
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              withdrawQty: { $sum: 1 },
              totalWithdraw: { $sum: { $ifNull: ["$bankAmount", "$amount"] } },
              uniquePlayers: { $addToSet: "$username" },
              totalProcessTime: {
                $sum: {
                  $add: [
                    {
                      $multiply: [
                        {
                          $convert: {
                            input: {
                              $arrayElemAt: [
                                { $split: ["$processtime", ":"] },
                                0,
                              ],
                            },
                            to: "int",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        3600,
                      ],
                    },
                    {
                      $multiply: [
                        {
                          $convert: {
                            input: {
                              $arrayElemAt: [
                                { $split: ["$processtime", ":"] },
                                1,
                              ],
                            },
                            to: "int",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        60,
                      ],
                    },
                    {
                      $convert: {
                        input: {
                          $arrayElemAt: [{ $split: ["$processtime", ":"] }, 2],
                        },
                        to: "int",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
        Bonus.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              totalBonus: { $sum: "$amount" },
            },
          },
        ]),
        RebateLog.aggregate([
          {
            $match: dateFilter,
          },
          {
            $group: {
              _id: null,
              totalRebate: { $sum: "$totalRebate" },
            },
          },
        ]),
        BankTransactionLog.aggregate([
          {
            $match: {
              transactiontype: { $in: ["cashin", "cashout"] },
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              totalCashIn: {
                $sum: {
                  $cond: [
                    { $eq: ["$transactiontype", "cashin"] },
                    "$amount",
                    0,
                  ],
                },
              },
              totalCashOut: {
                $sum: {
                  $cond: [
                    { $eq: ["$transactiontype", "cashout"] },
                    "$amount",
                    0,
                  ],
                },
              },
            },
          },
        ]),
        Deposit.countDocuments({
          newDeposit: true,
          status: "approved",
          reverted: false,
          ...dateFilter,
        }),
        Promise.all([
          Deposit.countDocuments({ reverted: true, ...dateFilter }),
          Withdraw.countDocuments({ reverted: true, ...dateFilter }),
          Bonus.countDocuments({ reverted: true, ...dateFilter }),
        ]),
        User.countDocuments(dateFilter),
        UserWalletCashOut.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              cashoutQty: { $sum: 1 },
              totalUserCashout: { $sum: "$amount" },
            },
          },
        ]),
        UserWalletCashIn.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              cashinQty: { $sum: 1 },
              totalUserCashin: { $sum: "$amount" },
            },
          },
        ]),
      ]);

      const newDepositBreakdown = await Deposit.aggregate([
        {
          $match: {
            newDeposit: true,
            status: "approved",
            reverted: false,
            ...dateFilter,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $unwind: "$user",
        },
        {
          $lookup: {
            from: "users",
            localField: "user.referralBy.user_id",
            foreignField: "_id",
            as: "referrer",
          },
        },
        {
          $unwind: {
            path: "$referrer",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            userid: "$user.userid",
            username: 1,
            fullname: 1,
            amount: 1,
            referralByFullname: { $ifNull: ["$referrer.fullname", "-"] },
            createdAt: 1,
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      ]);

      const reportData = {
        depositQty: depositStats[0]?.depositQty || 0,
        totalDeposit: depositStats[0]?.totalDeposit || 0,
        withdrawQty: withdrawStats[0]?.withdrawQty || 0,
        totalWithdraw: withdrawStats[0]?.totalWithdraw || 0,
        totalBonus: bonusStats[0]?.totalBonus || 0,
        totalRebate: rebateStats[0]?.totalRebate || 0,
        winLose:
          (depositStats[0]?.totalDeposit || 0) -
          (withdrawStats[0]?.totalWithdraw || 0),
        depositActivePlayers: depositStats[0]?.uniquePlayers?.length || 0,
        withdrawActivePlayers: withdrawStats[0]?.uniquePlayers?.length || 0,
        activePlayers: (() => {
          const depositPlayers = depositStats[0]?.uniquePlayers || [];
          const withdrawPlayers = withdrawStats[0]?.uniquePlayers || [];
          const allPlayers = [
            ...new Set([...depositPlayers, ...withdrawPlayers]),
          ];
          // console.log("=== Active Players Debug ===");
          // console.log("Deposit Players:", depositPlayers);
          // console.log("Withdraw Players:", withdrawPlayers);
          // console.log("All Unique Active Players:", allPlayers);
          // console.log("Total Active Players Count:", allPlayers.length);
          // console.log("============================");
          return allPlayers.length;
        })(),
        newDeposits: newDepositCount || 0,
        newDepositBreakdown: newDepositBreakdown || [],
        newRegistrations: newRegistrations || 0,
        revertedTransactions:
          (revertedStats[0] || 0) +
          (revertedStats[1] || 0) +
          (revertedStats[2] || 0),
        totalCashIn: cashStats[0]?.totalCashIn || 0,
        totalCashOut: cashStats[0]?.totalCashOut || 0,
        cashoutQty: userCashoutStats[0]?.cashoutQty || 0,
        totalUserCashout: userCashoutStats[0]?.totalUserCashout || 0,
        cashinQty: userCashinStats[0]?.cashinQty || 0,
        totalUserCashin: userCashinStats[0]?.totalUserCashin || 0,
        avgDepositTime: depositStats[0]?.depositQty
          ? formatSeconds(
              Math.round(
                depositStats[0].totalProcessTime / depositStats[0].depositQty
              )
            )
          : "00:00:00",
        avgWithdrawTime: withdrawStats[0]?.withdrawQty
          ? formatSeconds(
              Math.round(
                withdrawStats[0].totalProcessTime / withdrawStats[0].withdrawQty
              )
            )
          : "00:00:00",
      };
      res.status(200).json({
        success: true,
        message: "Report data retrieved successfully",
        data: reportData,
      });
    } catch (error) {
      console.error("Error generating summary report:", error);
      res.status(200).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

// Admin Get Player Report
router.get(
  "/admin/api/player-report",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required",
        });
      }

      const today = moment.utc().format("YYYY-MM-DD");
      const startDateFormatted = moment(new Date(startDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");
      const endDateFormatted = moment(new Date(endDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const needsTodayData = endDateFormatted >= today;
      const needsHistoricalData = startDateFormatted < today;

      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      // Run financial queries
      const financialResults = await Promise.all([
        Deposit.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              depositQty: { $sum: 1 },
              totalDeposit: { $sum: "$amount" },
            },
          },
        ]),

        Deposit.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: {
                username: "$username",
                date: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: {
                      $dateAdd: {
                        startDate: "$createdAt",
                        unit: "hour",
                        amount: 8,
                      },
                    },
                    timezone: "UTC",
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: "$_id.username",
              uniqueDepositDays: { $sum: 1 },
            },
          },
        ]),

        Withdraw.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              withdrawQty: { $sum: 1 },
              totalWithdraw: { $sum: "$amount" },
            },
          },
        ]),

        Bonus.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              totalBonus: { $sum: "$amount" },
            },
          },
        ]),

        RebateLog.aggregate([
          {
            $match: dateFilter,
          },
          {
            $group: {
              _id: "$username",
              totalRebate: { $sum: "$totalRebate" },
            },
          },
        ]),

        UserWalletCashOut.aggregate([
          {
            $match: {
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              totalCashout: { $sum: "$amount" },
            },
          },
        ]),
        UserWalletCashIn.aggregate([
          {
            $match: {
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              totalCashin: { $sum: "$amount" },
            },
          },
        ]),
      ]);

      // Extract financial data
      const [
        depositStats,
        uniqueDepositStats,
        withdrawStats,
        bonusStats,
        rebateStats,
        cashoutStats,
        cashinStats,
      ] = financialResults;

      // Generic aggregation function for game turnover
      const getAllUsersTurnover = async (
        model,
        matchConditions,
        turnoverExpression = { $ifNull: ["$betamount", 0] }
      ) => {
        try {
          // Add date filter to match conditions
          const fullMatchConditions = {
            ...matchConditions,
            createdAt: dateFilter.createdAt,
          };

          const results = await model.aggregate([
            {
              $match: fullMatchConditions,
            },
            {
              $group: {
                _id: { $toLower: "$username" },
                turnover: { $sum: turnoverExpression },
              },
            },
          ]);

          return results.map((item) => ({
            username: item._id,
            turnover: Number(item.turnover.toFixed(2)),
          }));
        } catch (error) {
          console.error(
            `Error aggregating turnover for model ${model.modelName}:`,
            error
          );
          return [];
        }
      };

      // Process turnover data
      const userTurnoverMap = {};

      // Get historical data if needed
      if (needsHistoricalData) {
        const historicalData = await GameDataLog.find({
          date: {
            $gte: startDateFormatted,
            $lte:
              endDateFormatted < today
                ? endDateFormatted
                : moment.utc().subtract(1, "days").format("YYYY-MM-DD"),
          },
        });

        historicalData.forEach((record) => {
          const username = record.username.toLowerCase();

          if (!userTurnoverMap[username]) {
            userTurnoverMap[username] = 0;
          }

          // Convert gameCategories Map to Object if needed
          const gameCategories =
            record.gameCategories instanceof Map
              ? Object.fromEntries(record.gameCategories)
              : record.gameCategories;

          // Sum up turnover from all categories and games
          if (gameCategories) {
            Object.keys(gameCategories).forEach((categoryName) => {
              const category =
                gameCategories[categoryName] instanceof Map
                  ? Object.fromEntries(gameCategories[categoryName])
                  : gameCategories[categoryName];

              // Process each game in this category
              Object.keys(category).forEach((gameName) => {
                const game = category[gameName];
                const turnover = Number(game.turnover || 0);

                // Add to user total
                userTurnoverMap[username] += turnover;
              });
            });
          }
        });
      }

      // Get today's data if needed
      if (needsTodayData) {
        const todayGamePromises = [
          // Pragmatic Play (PP)
          // getAllUsersTurnover(SlotLivePPModal, {
          //   refunded: false,
          //   ended: true,
          // }),
        ];

        const todayGameResults = await Promise.allSettled(todayGamePromises);

        todayGameResults.forEach((gameResultPromise) => {
          if (gameResultPromise.status === "fulfilled") {
            const gameResults = gameResultPromise.value;

            gameResults.forEach((userResult) => {
              const username = userResult.username;
              if (!username) return;

              if (!userTurnoverMap[username]) {
                userTurnoverMap[username] = 0;
              }

              userTurnoverMap[username] += userResult.turnover || 0;
            });
          }
        });
      }

      // Get all unique usernames
      const usernames = new Set([
        ...depositStats.map((stat) => stat._id),
        ...uniqueDepositStats.map((stat) => stat._id),
        ...withdrawStats.map((stat) => stat._id),
        ...bonusStats.map((stat) => stat._id),
        ...rebateStats.map((stat) => stat._id),
        ...cashoutStats.map((stat) => stat._id),
        ...cashinStats.map((stat) => stat._id),
        ...Object.keys(userTurnoverMap),
      ]);

      const users = await User.find({
        username: { $in: Array.from(usernames) },
      }).select("username userid");
      const userIdMap = {};
      users.forEach((u) => {
        userIdMap[u.username] = u.userid;
      });

      // Create report data
      const reportData = Array.from(usernames).map((username) => {
        const deposit =
          depositStats.find((stat) => stat._id === username) || {};
        const uniqueDeposit =
          uniqueDepositStats.find((stat) => stat._id === username) || {};
        const withdraw =
          withdrawStats.find((stat) => stat._id === username) || {};
        const bonus = bonusStats.find((stat) => stat._id === username) || {};
        const rebate = rebateStats.find((stat) => stat._id === username) || {};
        const cashout =
          cashoutStats.find((stat) => stat._id === username) || {};
        const cashin = cashinStats.find((stat) => stat._id === username) || {};
        const totalTurnover = userTurnoverMap[username] || 0;

        return {
          userid: userIdMap[username] || null,
          username,
          depositQty: deposit.depositQty || 0,
          totalDeposit: deposit.totalDeposit || 0,
          uniqueDepositDays: uniqueDeposit.uniqueDepositDays || 0,
          withdrawQty: withdraw.withdrawQty || 0,
          totalWithdraw: withdraw.totalWithdraw || 0,
          totalBonus: bonus.totalBonus || 0,
          totalRebate: rebate.totalRebate || 0,
          totalCashout: cashout.totalCashout || 0,
          totalCashin: cashin.totalCashin || 0,
          totalTurnover: Number(totalTurnover.toFixed(2)),
          winLose: (deposit.totalDeposit || 0) - (withdraw.totalWithdraw || 0),
        };
      });

      res.status(200).json({
        success: true,
        message: "Report data retrieved successfully",
        data: reportData,
        dateRange: {
          start: startDateFormatted,
          end: endDateFormatted,
        },
      });
    } catch (error) {
      console.error("Error generating user summary report:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

// Admin Get Player Report (Timezone)
router.get(
  "/admin/api/player-report-timezone",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required",
        });
      }

      const pngTimezone = "Pacific/Port_Moresby";
      const today = moment().tz(pngTimezone).format("YYYY-MM-DD");
      const startDateFormatted = startDate;
      const endDateFormatted = endDate;
      const needsTodayData = endDateFormatted >= today;
      const needsHistoricalData = startDateFormatted < today;
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment
            .tz(startDateFormatted, "YYYY-MM-DD", pngTimezone)
            .startOf("day")
            .utc()
            .toDate(),
          $lte: moment
            .tz(endDateFormatted, "YYYY-MM-DD", pngTimezone)
            .endOf("day")
            .utc()
            .toDate(),
        };
      }

      // Run financial queries
      const financialResults = await Promise.all([
        Deposit.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              depositQty: { $sum: 1 },
              totalDeposit: { $sum: "$amount" },
            },
          },
        ]),

        Deposit.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: {
                username: "$username",
                date: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: {
                      $dateAdd: {
                        startDate: "$createdAt",
                        unit: "hour",
                        amount: 8,
                      },
                    },
                    timezone: "UTC",
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: "$_id.username",
              uniqueDepositDays: { $sum: 1 },
            },
          },
        ]),

        Withdraw.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              withdrawQty: { $sum: 1 },
              totalWithdraw: { $sum: "$amount" },
            },
          },
        ]),

        Bonus.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              totalBonus: { $sum: "$amount" },
            },
          },
        ]),

        RebateLog.aggregate([
          {
            $match: dateFilter,
          },
          {
            $group: {
              _id: "$username",
              totalRebate: { $sum: "$totalRebate" },
            },
          },
        ]),

        UserWalletCashOut.aggregate([
          {
            $match: {
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              totalCashout: { $sum: "$amount" },
            },
          },
        ]),
        UserWalletCashIn.aggregate([
          {
            $match: {
              reverted: false,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: "$username",
              totalCashin: { $sum: "$amount" },
            },
          },
        ]),
      ]);

      // Extract financial data
      const [
        depositStats,
        uniqueDepositStats,
        withdrawStats,
        bonusStats,
        rebateStats,
        cashoutStats,
        cashinStats,
      ] = financialResults;

      // Generic aggregation function for game turnover
      const getAllUsersTurnover = async (
        model,
        matchConditions,
        turnoverExpression = { $ifNull: ["$betamount", 0] }
      ) => {
        try {
          // Add date filter to match conditions
          const fullMatchConditions = {
            ...matchConditions,
            createdAt: dateFilter.createdAt,
          };

          const results = await model.aggregate([
            {
              $match: fullMatchConditions,
            },
            {
              $group: {
                _id: { $toLower: "$username" },
                turnover: { $sum: turnoverExpression },
              },
            },
          ]);

          return results.map((item) => ({
            username: item._id,
            turnover: Number(item.turnover.toFixed(2)),
          }));
        } catch (error) {
          console.error(
            `Error aggregating turnover for model ${model.modelName}:`,
            error
          );
          return [];
        }
      };

      // Process turnover data
      const userTurnoverMap = {};

      // Get historical data if needed
      if (needsHistoricalData) {
        const historicalData = await GameDataLog.find({
          date: {
            $gte: startDateFormatted,
            $lte:
              endDateFormatted < today
                ? endDateFormatted
                : moment.utc().subtract(1, "days").format("YYYY-MM-DD"),
          },
        });

        historicalData.forEach((record) => {
          const username = record.username.toLowerCase();

          if (!userTurnoverMap[username]) {
            userTurnoverMap[username] = 0;
          }

          // Convert gameCategories Map to Object if needed
          const gameCategories =
            record.gameCategories instanceof Map
              ? Object.fromEntries(record.gameCategories)
              : record.gameCategories;

          // Sum up turnover from all categories and games
          if (gameCategories) {
            Object.keys(gameCategories).forEach((categoryName) => {
              const category =
                gameCategories[categoryName] instanceof Map
                  ? Object.fromEntries(gameCategories[categoryName])
                  : gameCategories[categoryName];

              // Process each game in this category
              Object.keys(category).forEach((gameName) => {
                const game = category[gameName];
                const turnover = Number(game.turnover || 0);

                // Add to user total
                userTurnoverMap[username] += turnover;
              });
            });
          }
        });
      }

      // Get today's data if needed
      if (needsTodayData) {
        const todayGamePromises = [
          // Pragmatic Play (PP)
          // getAllUsersTurnover(SlotLivePPModal, {
          //   refunded: false,
          //   ended: true,
          // }),
        ];

        const todayGameResults = await Promise.allSettled(todayGamePromises);

        todayGameResults.forEach((gameResultPromise) => {
          if (gameResultPromise.status === "fulfilled") {
            const gameResults = gameResultPromise.value;

            gameResults.forEach((userResult) => {
              const username = userResult.username;
              if (!username) return;

              if (!userTurnoverMap[username]) {
                userTurnoverMap[username] = 0;
              }

              userTurnoverMap[username] += userResult.turnover || 0;
            });
          }
        });
      }

      // Get all unique usernames
      const usernames = new Set([
        ...depositStats.map((stat) => stat._id),
        ...uniqueDepositStats.map((stat) => stat._id),
        ...withdrawStats.map((stat) => stat._id),
        ...bonusStats.map((stat) => stat._id),
        ...rebateStats.map((stat) => stat._id),
        ...cashoutStats.map((stat) => stat._id),
        ...cashinStats.map((stat) => stat._id),
        ...Object.keys(userTurnoverMap),
      ]);

      const users = await User.find({
        username: { $in: Array.from(usernames) },
      }).select("username userid");
      const userIdMap = {};
      users.forEach((u) => {
        userIdMap[u.username] = u.userid;
      });

      // Create report data
      const reportData = Array.from(usernames).map((username) => {
        const deposit =
          depositStats.find((stat) => stat._id === username) || {};
        const uniqueDeposit =
          uniqueDepositStats.find((stat) => stat._id === username) || {};
        const withdraw =
          withdrawStats.find((stat) => stat._id === username) || {};
        const bonus = bonusStats.find((stat) => stat._id === username) || {};
        const rebate = rebateStats.find((stat) => stat._id === username) || {};
        const cashout =
          cashoutStats.find((stat) => stat._id === username) || {};
        const cashin = cashinStats.find((stat) => stat._id === username) || {};
        const totalTurnover = userTurnoverMap[username] || 0;

        return {
          userid: userIdMap[username] || null,
          username,
          depositQty: deposit.depositQty || 0,
          totalDeposit: deposit.totalDeposit || 0,
          uniqueDepositDays: uniqueDeposit.uniqueDepositDays || 0,
          withdrawQty: withdraw.withdrawQty || 0,
          totalWithdraw: withdraw.totalWithdraw || 0,
          totalBonus: bonus.totalBonus || 0,
          totalRebate: rebate.totalRebate || 0,
          totalCashout: cashout.totalCashout || 0,
          totalCashin: cashin.totalCashin || 0,
          totalTurnover: Number(totalTurnover.toFixed(2)),
          winLose: (deposit.totalDeposit || 0) - (withdraw.totalWithdraw || 0),
        };
      });

      res.status(200).json({
        success: true,
        message: "Report data retrieved successfully",
        data: reportData,
        dateRange: {
          start: startDateFormatted,
          end: endDateFormatted,
        },
      });
    } catch (error) {
      console.error("Error generating user summary report:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

router.get(
  "/admin/api/user/:userId/gamewalletlog",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const { startDate, endDate } = req.query;

      const dateFilter = {
        username: user.username,
      };
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const logs = await GameWalletLog.find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();

      return res.status(200).json({
        success: true,
        message: "Game wallet log retrieved successfully",
        data: logs,
      });
    } catch (error) {
      console.error("Error generating game wallet log:", error);
      res.status(200).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

// Get Today's Birthday Users (GMT+11)
router.get(
  "/admin/api/getTodayBirthdayUsers",

  async (req, res) => {
    try {
      const sydneyTime = moment().tz("Australia/Sydney");
      const todayMonth = sydneyTime.format("MM");
      const todayDay = sydneyTime.format("DD");
      const users = await User.find({
        dob: { $exists: true, $ne: null },
      }).select("username fullname dob");
      const birthdayUsers = users.filter((user) => {
        if (!user.dob) return false;
        const userBirthday = moment(user.dob, "DD/MM/YYYY");
        return (
          userBirthday.format("MM") === todayMonth &&
          userBirthday.format("DD") === todayDay
        );
      });
      const formattedUsers = birthdayUsers.map((user) => ({
        username: user.username,
        fullname: user.fullname,
        dob: user.dob,
      }));

      res.json({
        success: true,
        date: sydneyTime.format("DD/MM/YYYY"),
        timezone: "GMT+11 (Sydney)",
        birthdayUsers: formattedUsers,
      });
    } catch (error) {
      console.error("Error fetching birthday users:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch birthday users",
        error: error.message,
      });
    }
  }
);

// Get User Duplicate IP
router.get("/admin/api/users/find-by-ip/:ip", async (req, res) => {
  try {
    const { ip } = req.params;
    const users = await User.find(
      {
        $or: [{ lastLoginIp: ip }, { registerIp: ip }],
      },
      {
        username: 1,
        fullname: 1,
        lastLoginIp: 1,
        registerIp: 1,
        _id: 0,
      }
    );
    if (!users || users.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No users found with this IP",
      });
    }
    const formattedUsers = users.map((user) => ({
      username: user.username,
      fullname: user.fullname,
      matchedWith: {
        lastLoginIp: user.lastLoginIp === ip,
        registerIp: user.registerIp === ip,
      },
    }));
    return res.status(200).json({
      success: true,
      data: formattedUsers,
      message: `Found ${users.length} user(s) with matching IP`,
    });
  } catch (error) {
    console.error("Error finding users by IP:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Admin Delete User
router.delete(
  "/admin/api/user/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      await User.findByIdAndDelete(userId);
      await adminLog.create({
        company: adminuser.company,
        username: adminuser.username,
        fullname: adminuser.fullname,
        loginTime: new Date(),
        ip: req.headers["x-forwarded-for"] || req.ip,
        remark: `Deleted user: ${user.username}`,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "User has been deleted successfully",
          zh: "用户已成功删除",
        },
      });
    } catch (error) {
      console.error("Error deleting user:", error);
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

// Admin Panel Get Contacts
router.get("/admin/api/contacts", authenticateAdminToken, async (req, res) => {
  try {
    const contactdata = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, data: contactdata });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Generate Magic Link
router.post(
  "/admin/api/user/:userId/generate-magic-link",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "未找到管理员用户，请联系客户服务",
          },
        });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 30 * 60 * 1000);
      user.adminMagicToken = token;
      user.adminMagicTokenExpires = expires;
      user.adminMagicTokenUsed = false;
      await user.save();

      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();

      await adminLog.create({
        company: adminuser.company,
        username: adminuser.username,
        fullname: adminuser.fullname,
        loginTime: new Date(),
        ip: clientIp,
        remark: `Generated magic link for user: ${user.username}`,
      });

      const magicLink = `${process.env.FRONTEND_URL}magic-login?token=${token}`;

      res.status(200).json({
        success: true,
        magicLink: magicLink,
        expiresAt: expires,
        user: {
          username: user.username,
          fullname: user.fullname,
        },
        message: {
          en: `Magic link generated for user: ${user.username}`,
          zh: `已为用户 ${user.username} 生成魔法链接`,
        },
      });
    } catch (error) {
      console.error("Generate admin magic link error:", error);
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

// Verify Magic Link
router.get("/api/verify-magic-link/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      adminMagicToken: token,
      adminMagicTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid or expired magic link",
          zh: "无效或已过期的魔法链接",
        },
      });
    }

    user.adminMagicTokenUsed = true;
    user.lastLogin = new Date();
    user.lastAdminAccess = new Date();
    await user.save();

    const {
      token: authToken,
      refreshToken,
      newGameToken,
    } = await handleLoginSuccess(user._id);

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();
    const geo = geoip.lookup(clientIp);

    await userLogAttempt(
      user.username,
      user.fullname,
      user.phonenumber,
      req.get("User-Agent"),
      clientIp,
      geo ? geo.country : "Unknown",
      geo ? geo.city : "Unknown",
      "Admin Magic Link Login Success"
    );

    res.status(200).json({
      success: true,
      token: authToken,
      refreshToken,
      newGameToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullname: user.fullname,
      },
      message: {
        en: "Magic link login successful",
        zh: "魔法链接登录成功",
      },
    });
  } catch (error) {
    console.error("Verify admin magic link error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Validate Admin Direct Deposit
router.post(
  "/admin/api/validate-direct-deposit",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found",
            zh: "未找到管理员用户",
          },
        });
      }
      const {
        userId,
        username,
        amount,
        bankAmount,
        walletSaveAmount,
        bankId,
        fromWallet,
        transactionId: customTransactionId,
      } = req.body;
      const kioskDepositAmount = Number(amount) || 0;
      const saveToWalletAmount = Number(walletSaveAmount) || 0;
      if (!userId || !username) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid request data",
            zh: "请求数据无效",
          },
        });
      }
      if (!fromWallet && kioskDepositAmount <= 0 && saveToWalletAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid amount",
            zh: "金额无效",
          },
        });
      }
      if (fromWallet && kioskDepositAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid amount",
            zh: "金额无效",
          },
        });
      }
      if (!fromWallet && !bankId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank is required",
            zh: "请选择银行",
          },
        });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      if (!user.status) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User account is suspended",
            zh: "用户账户已被封锁",
          },
        });
      }
      if (fromWallet) {
        if (Number(user.wallet) < kioskDepositAmount) {
          return res.status(200).json({
            success: false,
            message: {
              en: `Insufficient wallet balance. Current: ${user.wallet}, Required: ${kioskDepositAmount}`,
              zh: `钱包余额不足。当前: ${user.wallet}，需要: ${kioskDepositAmount}`,
            },
          });
        }
      }
      if (!fromWallet) {
        const bank = await BankList.findById(bankId);
        if (!bank) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Bank not found",
              zh: "找不到银行",
            },
          });
        }
      }
      if (customTransactionId) {
        const existingDeposit = await Deposit.findOne({
          transactionId: customTransactionId,
        });
        if (existingDeposit) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Transaction ID already exists",
              zh: "交易编号已存在",
            },
          });
        }
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Validation passed",
          zh: "验证通过",
        },
      });
    } catch (error) {
      console.error("Error in validate direct deposit:", error);
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

// Admin Direct Deposit
router.post(
  "/admin/api/admin-direct-deposit",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found",
            zh: "未找到管理员用户",
          },
        });
      }

      const {
        userId,
        username,
        amount,
        bankAmount,
        walletSaveAmount,
        kioskId,
        kioskName,
        bankId,
        fromWallet,
        transactionId: customTransactionId,
        remark,
      } = req.body;

      const kioskDepositAmount = Number(amount) || 0;
      const totalBankAmount = Number(bankAmount) || kioskDepositAmount;
      const saveToWalletAmount = Number(walletSaveAmount) || 0;

      if (!userId || !username) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid request data",
            zh: "请求数据无效",
          },
        });
      }

      if (!fromWallet && kioskDepositAmount <= 0 && saveToWalletAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid amount",
            zh: "金额无效",
          },
        });
      }

      if (fromWallet && kioskDepositAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid amount",
            zh: "金额无效",
          },
        });
      }

      if (!fromWallet && !bankId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank is required",
            zh: "请选择银行",
          },
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      if (!user.status) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User account is suspended",
            zh: "用户账户已被封锁",
          },
        });
      }

      if (fromWallet) {
        if (Number(user.wallet) < kioskDepositAmount) {
          return res.status(200).json({
            success: false,
            message: {
              en: `Insufficient wallet balance. Current: ${user.wallet}, Required: ${kioskDepositAmount}`,
              zh: `钱包余额不足。当前: ${user.wallet}，需要: ${kioskDepositAmount}`,
            },
          });
        }
      }

      let bank = null;
      if (!fromWallet) {
        bank = await BankList.findById(bankId);
        if (!bank) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Bank not found",
              zh: "找不到银行",
            },
          });
        }
      }

      const transactionId = customTransactionId || uuidv4();
      if (customTransactionId) {
        const existingDeposit = await Deposit.findOne({
          transactionId: customTransactionId,
        });
        if (existingDeposit) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Transaction ID already exists",
              zh: "交易编号已存在",
            },
          });
        }
      }
      let finalRemark = remark || "-";
      if (fromWallet) {
        finalRemark = `${remark || "-"} | From Wallet`;
      } else if (saveToWalletAmount > 0) {
        finalRemark = `${
          remark || "-"
        } | Kiosk: ${kioskDepositAmount}, Save to Wallet: ${saveToWalletAmount}`;
      }

      const newDeposit = new Deposit({
        transactionId,
        userId: user._id,
        userid: user.userid,
        username: user.username,
        fullname: user.fullname,
        bankid: fromWallet ? null : bank._id,
        bankname: fromWallet ? "User Wallet" : bank.bankname,
        ownername: fromWallet ? user.fullname : bank.ownername,
        transfernumber: fromWallet ? "-" : bank.bankaccount,
        walletType: "Main",
        transactionType: "deposit",
        processBy: adminuser.username,
        amount: kioskDepositAmount,
        bankAmount: fromWallet ? null : totalBankAmount,
        walletamount: user.wallet,
        method: "admin",
        status: "approved",
        remark: finalRemark,
        game: kioskName,
        processtime: "0s",
        duplicateIP: user.duplicateIP || false,
        duplicateBank: user.duplicateBank || false,
        newDeposit: user.firstDepositDate === null,
      });
      await newDeposit.save();

      const isFirstDeposit = user.firstDepositDate === null;
      const userUpdate = {
        $inc: {
          totaldeposit: kioskDepositAmount,
        },
        $set: {
          lastdepositdate: new Date(),
          ...(isFirstDeposit && { firstDepositDate: new Date() }),
        },
      };

      if (fromWallet) {
        userUpdate.$inc.wallet = -kioskDepositAmount;
      }

      if (saveToWalletAmount > 0) {
        userUpdate.$inc.wallet =
          (userUpdate.$inc.wallet || 0) + saveToWalletAmount;
      }

      await User.findByIdAndUpdate(user._id, userUpdate);
      await checkAndUpdateVIPLevel(user._id);

      if (!fromWallet) {
        const updatedBank = await BankList.findByIdAndUpdate(
          bankId,
          [
            {
              $set: {
                totalDeposits: { $add: ["$totalDeposits", totalBankAmount] },
                currentbalance: {
                  $subtract: [
                    {
                      $add: [
                        "$startingbalance",
                        { $add: ["$totalDeposits", totalBankAmount] },
                        "$totalCashIn",
                      ],
                    },
                    {
                      $add: [
                        "$totalWithdrawals",
                        "$totalCashOut",
                        "$totalTransactionFees",
                      ],
                    },
                  ],
                },
              },
            },
          ],
          { new: true } // 返回更新后的文档
        );

        // 直接用 updatedBank，不需要再 findById
        const bankLog = new BankTransactionLog({
          transactionId,
          bankName: bank.bankname,
          ownername: bank.ownername,
          bankAccount: bank.bankaccount,
          remark: finalRemark,
          lastBalance: updatedBank.currentbalance - totalBankAmount,
          currentBalance: updatedBank.currentbalance,
          processby: adminuser.username,
          qrimage: bank.qrimage,
          userid: user.userid,
          playerusername: user.username,
          playerfullname: user.fullname,
          transactiontype: "deposit",
          amount: totalBankAmount,
        });
        await bankLog.save();
      }

      const walletLog = new UserWalletLog({
        userId: user._id,
        transactionid: transactionId,
        transactiontime: new Date(),
        transactiontype: fromWallet ? "Deposit from Wallet" : "deposit",
        amount: kioskDepositAmount,
        status: "approved",
        remark: fromWallet ? "From Wallet" : remark,
        game: kioskName,
      });
      await walletLog.save();

      res.status(200).json({
        success: true,
        message: {
          en: fromWallet
            ? `Deposit of ${kioskDepositAmount} from wallet approved for ${username}`
            : `Deposit of ${kioskDepositAmount} approved for ${username}`,
          zh: fromWallet
            ? `已为 ${username} 批准从钱包存款 ${kioskDepositAmount}`
            : `已为 ${username} 批准 ${kioskDepositAmount} 存款`,
        },
        data: {
          depositId: newDeposit._id,
          transactionId,
        },
      });
    } catch (error) {
      console.error("Error in admin direct deposit:", error);
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

// Validate Admin Direct Withdraw
router.post(
  "/admin/api/validate-direct-withdraw",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found",
            zh: "未找到管理员用户",
          },
        });
      }

      const {
        userId,
        username,
        amount,
        walletAmount,
        bankId,
        toWallet,
        deductTransactionFees,
        transactionId: customTransactionId,
      } = req.body;

      const kioskWithdrawAmount = Number(amount) || 0;
      const walletWithdrawAmount = Number(walletAmount) || 0;
      const totalBankAmount = kioskWithdrawAmount + walletWithdrawAmount;

      if (!userId || !username) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid request data",
            zh: "请求数据无效",
          },
        });
      }

      if (totalBankAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid amount",
            zh: "金额无效",
          },
        });
      }

      if (!toWallet && !bankId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank is required",
            zh: "请选择银行",
          },
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      if (!user.status) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User account is suspended",
            zh: "用户账户已被封锁",
          },
        });
      }
      const withdrawCountLimit = 100;
      const malaysiaTimezone = "Asia/Kuala_Lumpur";
      const todayStart = moment().tz(malaysiaTimezone).startOf("day").utc();
      const todayEnd = moment().tz(malaysiaTimezone).endOf("day").utc();
      const todayWithdrawalCount = await Withdraw.countDocuments({
        userId: user._id,
        status: "approved",
        bankname: { $ne: "User Wallet" },
        createdAt: {
          $gte: todayStart.toDate(),
          $lte: todayEnd.toDate(),
        },
      });
      if (!toWallet && todayWithdrawalCount >= withdrawCountLimit) {
        return res.status(200).json({
          success: false,
          message: {
            en: `Daily withdrawal limit reached (maximum ${withdrawCountLimit} times per day). You've already made ${todayWithdrawalCount} withdrawal(s) today.`,
            zh: `已达到每日提款限制（每天最多${withdrawCountLimit}次）。您今日已提款${todayWithdrawalCount}次。`,
          },
        });
      }
      if (walletWithdrawAmount > 0) {
        if (Number(user.wallet) < walletWithdrawAmount) {
          return res.status(200).json({
            success: false,
            message: {
              en: `Insufficient wallet balance. Current: ${user.wallet}, Required: ${walletWithdrawAmount}`,
              zh: `钱包余额不足。当前: ${user.wallet}，需要: ${walletWithdrawAmount}`,
            },
          });
        }
      }
      let bank = null;
      if (!toWallet) {
        bank = await BankList.findById(bankId);
        if (!bank) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Bank not found",
              zh: "找不到银行",
            },
          });
        }

        const transactionFeesAmount = deductTransactionFees
          ? Number(bank.transactionfees) || 0
          : 0;
        const totalRequired = totalBankAmount + transactionFeesAmount;

        if (bank.currentbalance < totalRequired) {
          return res.status(200).json({
            success: false,
            message: {
              en: `Insufficient bank balance. Current: ${
                bank.currentbalance
              }, Required: ${totalRequired}${
                transactionFeesAmount > 0
                  ? ` (includes transaction fees: ${transactionFeesAmount})`
                  : ""
              }`,
              zh: `银行余额不足。当前: ${
                bank.currentbalance
              }，需要: ${totalRequired}${
                transactionFeesAmount > 0
                  ? `（含手续费: ${transactionFeesAmount}）`
                  : ""
              }`,
            },
          });
        }
      }
      if (customTransactionId) {
        const existingWithdraw = await Withdraw.findOne({
          transactionId: customTransactionId,
        });
        if (existingWithdraw) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Transaction ID already exists",
              zh: "交易编号已存在",
            },
          });
        }
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Validation passed",
          zh: "验证通过",
        },
      });
    } catch (error) {
      console.error("Error in validate direct withdraw:", error);
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

// Admin Direct Withdraw
router.post(
  "/admin/api/admin-direct-withdraw",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found",
            zh: "未找到管理员用户",
          },
        });
      }

      const {
        userId,
        username,
        amount,
        walletAmount,
        kioskId,
        kioskName,
        bankId,
        toWallet,
        transactionId: customTransactionId,
        remark,
      } = req.body;

      const kioskWithdrawAmount = Number(amount) || 0;
      const walletWithdrawAmount = Number(walletAmount) || 0;
      const totalBankAmount = kioskWithdrawAmount + walletWithdrawAmount;

      if (!userId || !username || totalBankAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid request data",
            zh: "请求数据无效",
          },
        });
      }

      if (!toWallet && !bankId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank is required",
            zh: "请选择银行",
          },
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      if (!user.status) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User account is suspended",
            zh: "用户账户已被封锁",
          },
        });
      }

      const withdrawCountLimit = 10;
      const pngTimezone = "Pacific/Port_Moresby";
      const todayStart = moment().tz(pngTimezone).startOf("day").utc();
      const todayEnd = moment().tz(pngTimezone).endOf("day").utc();
      const todayWithdrawalCount = await Withdraw.countDocuments({
        userId: user._id,
        status: "approved",
        bankname: { $ne: "User Wallet" },
        createdAt: {
          $gte: todayStart.toDate(),
          $lte: todayEnd.toDate(),
        },
      });
      if (todayWithdrawalCount >= withdrawCountLimit) {
        return res.status(200).json({
          success: false,
          message: {
            en: `Daily withdrawal limit reached (maximum ${withdrawCountLimit} times per day). You've already made ${todayWithdrawalCount} withdrawal(s) today.`,
            zh: `已达到每日提款限制（每天最多${withdrawCountLimit}次）。您今日已提款${todayWithdrawalCount}次。`,
          },
        });
      }

      let bank = null;
      if (!toWallet) {
        bank = await BankList.findById(bankId);
        if (!bank) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Bank not found",
              zh: "找不到银行",
            },
          });
        }
      }

      if (walletWithdrawAmount > 0) {
        if (Number(user.wallet) < walletWithdrawAmount) {
          return res.status(200).json({
            success: false,
            message: {
              en: `Insufficient wallet balance. Current: ${user.wallet}, Required: ${walletWithdrawAmount}`,
              zh: `钱包余额不足。当前: ${user.wallet}，需要: ${walletWithdrawAmount}`,
            },
          });
        }
      }

      const deductTransactionFees = req.body.deductTransactionFees;
      const transactionFeesAmount =
        !toWallet && deductTransactionFees && bank
          ? Number(bank.transactionfees) || 0
          : 0;

      if (!toWallet && bank) {
        const totalRequired = totalBankAmount + transactionFeesAmount;
        if (bank.currentbalance < totalRequired) {
          return res.status(200).json({
            success: false,
            message: {
              en: `Insufficient bank balance. Current: ${bank.currentbalance}, Required: ${totalRequired} (includes transaction fees: ${transactionFeesAmount})`,
              zh: `银行余额不足。当前: ${bank.currentbalance}，需要: ${totalRequired}（含手续费: ${transactionFeesAmount}）`,
            },
          });
        }
      }

      const transactionId = customTransactionId || uuidv4();
      if (customTransactionId) {
        const existingWithdraw = await Withdraw.findOne({
          transactionId: customTransactionId,
        });
        if (existingWithdraw) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Transaction ID already exists",
              zh: "交易编号已存在",
            },
          });
        }
      }
      if (toWallet) {
        const newWithdraw = new Withdraw({
          transactionId,
          userId: user._id,
          userid: user.userid,
          username: user.username,
          fullname: user.fullname,
          bankid: null,
          bankname: "User Wallet",
          ownername: user.fullname,
          transfernumber: "-",
          walletType: "Main",
          transactionType: "withdraw",
          processBy: adminuser.username,
          amount: Number(amount),
          walletamount: user.wallet,
          method: "admin",
          status: "approved",
          remark: remark || "Withdraw to wallet",
          game: kioskName,
          processtime: "0s",
          duplicateIP: user.duplicateIP || false,
          duplicateBank: user.duplicateBank || false,
        });
        await newWithdraw.save();

        await User.findByIdAndUpdate(user._id, {
          $inc: {
            totalwithdraw: Number(amount),
            wallet: Number(amount),
          },
        });

        const walletLog = new UserWalletLog({
          userId: user._id,
          transactionid: transactionId,
          transactiontime: new Date(),
          transactiontype: "Withdraw to Wallet",
          amount: Number(amount),
          status: "approved",
          remark: remark || "Withdraw to Wallet",
          game: kioskName,
        });
        await walletLog.save();

        res.status(200).json({
          success: true,
          message: {
            en: `Withdraw of ${amount} approved for ${username} (to wallet)`,
            zh: `已为 ${username} 批准 ${amount} 提款（到钱包）`,
          },
          data: {
            withdrawId: newWithdraw._id,
            transactionId,
          },
        });
      } else {
        const newWithdraw = new Withdraw({
          transactionId,
          userId: user._id,
          userid: user.userid,
          username: user.username,
          fullname: user.fullname,
          bankid: bank._id,
          bankname: bank.bankname,
          ownername: bank.ownername,
          transfernumber: bank.bankaccount,
          walletType: "Main",
          transactionType: "withdraw",
          processBy: adminuser.username,
          amount: kioskWithdrawAmount,
          bankAmount: totalBankAmount,
          walletamount: user.wallet,
          method: "admin",
          status: "approved",
          remark:
            walletWithdrawAmount > 0 || transactionFeesAmount > 0
              ? `${remark || "-"}${
                  walletWithdrawAmount > 0
                    ? ` | Include wallet: ${walletWithdrawAmount}`
                    : ""
                }${
                  transactionFeesAmount > 0
                    ? ` | Fees: ${transactionFeesAmount}`
                    : ""
                }`
              : remark,
          game: kioskName,
          processtime: "0s",
          duplicateIP: user.duplicateIP || false,
          duplicateBank: user.duplicateBank || false,
        });
        await newWithdraw.save();

        const userUpdate = {
          $inc: {
            totalwithdraw: kioskWithdrawAmount,
          },
        };
        if (walletWithdrawAmount > 0) {
          userUpdate.$inc.wallet = -walletWithdrawAmount;
        }
        await User.findByIdAndUpdate(user._id, userUpdate);

        const updatedBank = await BankList.findByIdAndUpdate(
          bankId,
          [
            {
              $set: {
                totalWithdrawals: {
                  $add: ["$totalWithdrawals", totalBankAmount],
                },
                currentbalance: {
                  $subtract: [
                    {
                      $add: [
                        "$startingbalance",
                        "$totalDeposits",
                        "$totalCashIn",
                      ],
                    },
                    {
                      $add: [
                        { $add: ["$totalWithdrawals", totalBankAmount] },
                        "$totalCashOut",
                        "$totalTransactionFees",
                      ],
                    },
                  ],
                },
              },
            },
          ],
          { new: true }
        );

        const bankLog = new BankTransactionLog({
          transactionId,
          bankName: bank.bankname,
          ownername: bank.ownername,
          bankAccount: bank.bankaccount,
          remark:
            walletWithdrawAmount > 0
              ? `${
                  remark || "-"
                } | Kiosk: ${kioskWithdrawAmount}, Wallet: ${walletWithdrawAmount}`
              : remark,
          lastBalance: updatedBank.currentbalance + totalBankAmount,
          currentBalance: updatedBank.currentbalance,
          processby: adminuser.username,
          qrimage: bank.qrimage,
          userid: user.userid,
          playerusername: user.username,
          playerfullname: user.fullname,
          transactiontype: "withdraw",
          amount: totalBankAmount,
        });
        await bankLog.save();

        if (transactionFeesAmount > 0) {
          const updatedBankAfterFees = await BankList.findByIdAndUpdate(
            bankId,
            [
              {
                $set: {
                  totalTransactionFees: {
                    $add: ["$totalTransactionFees", transactionFeesAmount],
                  },
                  currentbalance: {
                    $subtract: [
                      {
                        $add: [
                          "$startingbalance",
                          "$totalDeposits",
                          "$totalCashIn",
                        ],
                      },
                      {
                        $add: [
                          "$totalWithdrawals",
                          "$totalCashOut",
                          {
                            $add: [
                              "$totalTransactionFees",
                              transactionFeesAmount,
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
            { new: true }
          );

          const feesLog = new BankTransactionLog({
            transactionId: uuidv4(),
            bankName: bank.bankname,
            ownername: bank.ownername,
            bankAccount: bank.bankaccount,
            remark: `Transaction fees for withdraw ${transactionId}`,
            lastBalance:
              updatedBankAfterFees.currentbalance + transactionFeesAmount,
            currentBalance: updatedBankAfterFees.currentbalance,
            processby: adminuser.username,
            qrimage: bank.qrimage,
            userid: user.userid,
            playerusername: user.username,
            playerfullname: user.fullname,
            transactiontype: "transactionfee",
            amount: transactionFeesAmount,
          });
          await feesLog.save();
        }
        const walletLog = new UserWalletLog({
          userId: user._id,
          transactionid: transactionId,
          transactiontime: new Date(),
          transactiontype: "withdraw",
          amount: kioskWithdrawAmount,
          status: "approved",
          remark:
            walletWithdrawAmount > 0
              ? `Kiosk: ${kioskWithdrawAmount}, Wallet: ${walletWithdrawAmount}, Bank Total: ${totalBankAmount}`
              : remark,
          game: kioskName,
        });
        await walletLog.save();

        res.status(200).json({
          success: true,
          message: {
            en:
              walletWithdrawAmount > 0
                ? `Withdraw processed for ${username} (Kiosk: ${kioskWithdrawAmount}, Wallet: ${walletWithdrawAmount}, Total: ${totalBankAmount})`
                : `Withdraw of ${kioskWithdrawAmount} approved for ${username}`,
            zh:
              walletWithdrawAmount > 0
                ? `已为 ${username} 处理提款（Kiosk: ${kioskWithdrawAmount}, 钱包: ${walletWithdrawAmount}, 总计: ${totalBankAmount}）`
                : `已为 ${username} 批准 ${kioskWithdrawAmount} 提款`,
          },
          data: {
            withdrawId: newWithdraw._id,
            transactionId,
          },
        });
      }
    } catch (error) {
      console.error("Error in admin direct withdraw:", error);
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

// Admin Direct Bonus
router.post(
  "/admin/api/admin-direct-bonus",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found",
            zh: "未找到管理员用户",
          },
        });
      }
      const {
        userId,
        username,
        kioskId,
        kioskName,
        promotionId,
        amount,
        remark,
      } = req.body;
      if (!userId || !username || !promotionId || !amount || amount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid request data",
            zh: "请求数据无效",
          },
        });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      if (!user.status) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User account is suspended",
            zh: "用户账户已被封锁",
          },
        });
      }
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到促销活动",
          },
        });
      }

      const transactionId = uuidv4();
      const newBonus = new Bonus({
        transactionId,
        userId: user._id,
        userid: user.userid,
        username: user.username,
        fullname: user.fullname,
        transactionType: "bonus",
        processBy: adminuser.username,
        amount: Number(amount),
        walletamount: user.wallet,
        status: "approved",
        method: "admin",
        remark: remark || "-",
        game: kioskName,
        promotionname: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
        promotionId: promotion._id,
        duplicateIP: user.duplicateIP || false,
        duplicateBank: user.duplicateBank || false,
        processtime: "0s",
      });
      await newBonus.save();
      await User.findByIdAndUpdate(userId, {
        $inc: {
          totalbonus: Number(amount),
        },
      });
      const walletLog = new UserWalletLog({
        userId: user._id,
        transactionid: transactionId,
        transactiontime: new Date(),
        transactiontype: "bonus",
        amount: Number(amount),
        status: "approved",
        remark: remark || "-",
        game: kioskName,
        promotionnameCN: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
      });
      await walletLog.save();

      res.status(200).json({
        success: true,
        message: {
          en: `Bonus of ${amount} approved for ${username}`,
          zh: `已为 ${username} 批准 ${amount} 奖金`,
        },
        data: {
          bonusId: newBonus._id,
          transactionId,
        },
      });
    } catch (error) {
      console.error("Error in admin direct bonus:", error);
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

// Admin Transfer Game to Game
router.post(
  "/admin/api/admin-kiosk-transfer",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "找不到管理员用户，请联系客服",
          },
        });
      }

      const {
        userId,
        username,
        amount,
        fromKioskId,
        fromKioskName,
        fromUserKioskId,
        toKioskId,
        toKioskName,
        toUserKioskId,
        remark,
      } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const transactionId = uuidv4();
      const transferOutLog = new UserWalletLog({
        userId: user._id,
        transactionid: transactionId,
        transactiontime: new Date(),
        transactiontype: "kiosk transfer out",
        amount: Number(amount),
        status: "approved",
        remark: remark || `Transfer to ${toKioskName}`,
        game: fromKioskName,
      });
      await transferOutLog.save();
      await transferOutLog.save();

      const transferInLog = new UserWalletLog({
        userId: user._id,
        transactionid: transactionId,
        transactiontime: new Date(),
        transactiontype: "kiosk transfer in",
        amount: Number(amount),
        status: "approved",
        remark: remark || `Transfer from ${fromKioskName}`,
        game: toKioskName,
      });
      await transferInLog.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Transfer between kiosks successful",
          zh: "平台间转账成功",
        },
      });
    } catch (error) {
      console.error("Error processing kiosk transfer:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error processing transfer",
          zh: "处理转账时出错",
        },
      });
    }
  }
);

// Import用户数据
router.post(
  "/admin/api/import-users",
  authenticateAdminToken,
  async (req, res) => {
    const { users } = req.body;
    if (!users || !Array.isArray(users) || !users.length) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No users to import",
          zh: "没有用户数据",
        },
      });
    }
    const results = {
      success: [],
      failed: [],
      skipped: [],
    };
    const kiosks = await Kiosk.find({
      isActive: true,
      registerGameAPI: { $exists: true, $ne: "" },
    });
    const API_URL = process.env.API_URL || "http://localhost:3001/api/";

    for (const user of users) {
      const { id, fullname, phoneNumbers, bankAccounts } = user;
      if (!fullname || !phoneNumbers?.length) {
        results.failed.push({
          id,
          fullname,
          reason: "Missing fullname or phone",
        });
        continue;
      }
      const normalizedUsername = fullname.toLowerCase().replace(/\s+/g, "");
      const normalizedFullname = fullname.toLowerCase().replace(/\s+/g, "");
      const formattedPhoneNumbers = phoneNumbers.map((phone) => {
        const phoneStr = String(phone);
        if (phoneStr.length === 8) {
          return `675${phoneStr}`;
        }
        return phoneStr;
      });
      const primaryPhone = formattedPhoneNumbers[0];
      try {
        // 只检查 userid 是否重复
        const newUserId = parseInt(id);
        const existingUser = await User.findOne({ userid: newUserId });
        if (existingUser) {
          results.skipped.push({ id, fullname, reason: "Duplicate userid" });
          continue;
        }

        await general.findOneAndUpdate(
          { userIdCounter: { $lt: newUserId } },
          { $set: { userIdCounter: newUserId } },
          { sort: { createdAt: -1 } }
        );
        // 生成默认密码
        const defaultPassword = "123456";
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(defaultPassword, salt);
        // 生成 referral 相关
        const newReferralCode = await generateUniqueReferralCode();
        const referralLink = generateReferralLink(newReferralCode);
        const referralQrCode = await generateQRWithLogo(referralLink);
        const newUser = await User.create({
          userid: newUserId,
          username: normalizedUsername,
          fullname: normalizedFullname,
          password: hashedPassword,
          phonenumber: primaryPhone,
          phoneNumbers: formattedPhoneNumbers,
          bankAccounts: bankAccounts || [],
          registerIp: "csv import",
          referralLink,
          referralCode: newReferralCode,
          referralQrCode,
          viplevel: null,
          gameId: await generateUniqueGameId(),
        });

        // 注册 Kiosk
        for (const kiosk of kiosks) {
          try {
            const url = `${API_URL}${kiosk.registerGameAPI}/${newUser._id}`;
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: req.headers.authorization,
              },
              body: JSON.stringify({}),
            });
            const text = await response.text();
            try {
              JSON.parse(text);
            } catch (parseError) {
              console.error(`[Import] ${kiosk.name} - Invalid JSON response`);
            }
          } catch (error) {
            console.error(`[Import] ${kiosk.name} error:`, error.message);
          }
        }

        results.success.push({ id: newUserId, fullname });
      } catch (error) {
        console.error(`Import error for ${fullname}:`, error.message);
        results.failed.push({ id, fullname, reason: error.message });
      }
    }
    res.status(200).json({
      success: true,
      message: {
        en: `Import complete. Success: ${results.success.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`,
        zh: `导入完成。成功: ${results.success.length}, 跳过: ${results.skipped.length}, 失败: ${results.failed.length}`,
      },
      data: results,
    });
  }
);

// Update 用户银行
router.post(
  "/admin/api/import-users-bank",
  authenticateAdminToken,
  async (req, res) => {
    const { users } = req.body;
    if (!users || !Array.isArray(users) || !users.length) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No users to import",
          zh: "没有用户数据",
        },
      });
    }
    const results = {
      success: [],
      failed: [],
      skipped: [],
    };
    for (const user of users) {
      const { id, fullname, bankAccounts } = user;
      if (!id) {
        results.failed.push({
          id,
          fullname,
          reason: "Missing userid",
        });
        continue;
      }
      if (!bankAccounts || !bankAccounts.length) {
        results.skipped.push({
          id,
          fullname,
          reason: "No bank accounts to update",
        });
        continue;
      }
      try {
        const existingUser = await User.findOne({ userid: parseInt(id) });
        if (!existingUser) {
          results.skipped.push({
            id,
            fullname,
            reason: "User not found",
          });
          continue;
        }
        await User.findByIdAndUpdate(existingUser._id, {
          $set: { bankAccounts: bankAccounts },
        });
        results.success.push({ id, fullname });
      } catch (error) {
        console.error(`Import bank error for ${fullname}:`, error.message);
        results.failed.push({ id, fullname, reason: error.message });
      }
    }
    res.status(200).json({
      success: true,
      message: {
        en: `Bank import complete. Success: ${results.success.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`,
        zh: `银行导入完成。成功: ${results.success.length}, 跳过: ${results.skipped.length}, 失败: ${results.failed.length}`,
      },
      data: results,
    });
  }
);

// Reset all users totaldeposit to 0
router.post(
  "/admin/api/reset-all-totaldeposit",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const result = await User.updateMany({}, { $set: { totaldeposit: 0 } });

      res.status(200).json({
        success: true,
        message: {
          en: `Reset complete. ${result.modifiedCount} users updated.`,
          zh: `重置完成。已更新 ${result.modifiedCount} 个用户。`,
        },
        data: {
          matched: result.matchedCount,
          modified: result.modifiedCount,
        },
      });
    } catch (error) {
      console.error("Error resetting totaldeposit:", error);
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

// Import Deposits from CSV
router.post(
  "/admin/api/import-deposits",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { deposits } = req.body;

      if (!deposits || !Array.isArray(deposits) || !deposits.length) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No deposits to import",
            zh: "没有存款数据",
          },
        });
      }

      const results = {
        success: [],
        failed: [],
        skipped: [],
      };

      for (const item of deposits) {
        const { userid, dateTimeHK, amount, remark } = item;

        if (!userid || !amount) {
          results.failed.push({ userid, reason: "Missing userid or amount" });
          continue;
        }

        try {
          // 找用户
          const user = await User.findOne({ userid: parseInt(userid) });
          if (!user) {
            results.failed.push({ userid, reason: "User not found" });
            continue;
          }

          // UTC+8 转 UTC
          const transactionDate = new Date(dateTimeHK);
          const transactionId = uuidv4();
          const depositAmount = Math.abs(amount);

          const newDeposit = new Deposit({
            transactionId,
            userId: user._id,
            userid: user.userid,
            username: user.username,
            fullname: user.fullname,
            bankid: null,
            bankname: null,
            ownername: null,
            transfernumber: null,
            walletType: "Main",
            transactionType: "deposit",
            processBy: "csv import",
            amount: depositAmount,
            bankAmount: null,
            walletamount: null,
            method: "import",
            status: "approved",
            remark: remark || "csv import",
            game: null,
            processtime: "0s",
            duplicateIP: false,
            duplicateBank: false,
            newDeposit: false,
            createdAt: transactionDate,
            updatedAt: transactionDate,
          });

          await newDeposit.save();

          // 更新 user totaldeposit
          await User.findByIdAndUpdate(user._id, {
            $inc: { totaldeposit: depositAmount },
          });

          // 创建 UserWalletLog
          await UserWalletLog.create({
            userId: user._id,
            transactionid: transactionId,
            transactiontime: transactionDate,
            transactiontype: "deposit",
            amount: depositAmount,
            status: "approved",
            remark: remark || "csv import",
            game: null,
            createdAt: transactionDate,
            updatedAt: transactionDate,
          });

          results.success.push({
            userid,
            amount: depositAmount,
            date: transactionDate,
          });
        } catch (error) {
          results.failed.push({ userid, reason: error.message });
        }
      }

      res.status(200).json({
        success: true,
        message: {
          en: `Import complete. Success: ${results.success.length}, Failed: ${results.failed.length}`,
          zh: `导入完成。成功: ${results.success.length}, 失败: ${results.failed.length}`,
        },
        data: results,
      });
    } catch (error) {
      console.error("Error importing deposits:", error);
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

// Import Withdraws from CSV
router.post(
  "/admin/api/import-withdraws",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { withdraws } = req.body;

      if (!withdraws || !Array.isArray(withdraws) || !withdraws.length) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No withdraws to import",
            zh: "没有提款数据",
          },
        });
      }

      const results = {
        success: [],
        failed: [],
        skipped: [],
      };

      for (const item of withdraws) {
        const { userid, dateTimeHK, amount, remark } = item;

        if (!userid || !amount) {
          results.failed.push({ userid, reason: "Missing userid or amount" });
          continue;
        }

        try {
          // 找用户
          const user = await User.findOne({ userid: parseInt(userid) });
          if (!user) {
            results.failed.push({ userid, reason: "User not found" });
            continue;
          }

          // UTC+8 转 UTC
          const transactionDate = new Date(dateTimeHK);
          const transactionId = uuidv4();
          const withdrawAmount = Math.abs(amount);

          const newWithdraw = new Withdraw({
            transactionId,
            userId: user._id,
            userid: user.userid,
            username: user.username,
            fullname: user.fullname,
            bankid: null,
            bankname: null,
            ownername: null,
            transfernumber: null,
            walletType: "Main",
            transactionType: "withdraw",
            processBy: "csv import",
            amount: withdrawAmount,
            bankAmount: null,
            walletamount: null,
            method: "import",
            status: "approved",
            remark: remark || "csv import",
            game: null,
            processtime: "0s",
            duplicateIP: false,
            duplicateBank: false,
            createdAt: transactionDate,
            updatedAt: transactionDate,
          });

          await newWithdraw.save();

          // 更新 user totalwithdraw
          await User.findByIdAndUpdate(user._id, {
            $inc: { totalwithdraw: withdrawAmount },
          });

          // 创建 UserWalletLog
          await UserWalletLog.create({
            userId: user._id,
            transactionid: transactionId,
            transactiontime: transactionDate,
            transactiontype: "withdraw",
            amount: withdrawAmount,
            status: "approved",
            remark: remark || "csv import",
            game: null,
            createdAt: transactionDate,
            updatedAt: transactionDate,
          });

          results.success.push({
            userid,
            amount: withdrawAmount,
            date: transactionDate,
          });
        } catch (error) {
          results.failed.push({ userid, reason: error.message });
        }
      }

      res.status(200).json({
        success: true,
        message: {
          en: `Import complete. Success: ${results.success.length}, Failed: ${results.failed.length}`,
          zh: `导入完成。成功: ${results.success.length}, 失败: ${results.failed.length}`,
        },
        data: results,
      });
    } catch (error) {
      console.error("Error importing withdraws:", error);
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

// Import用户totalDeposit数据
router.post(
  "/admin/api/import-totaldeposit",

  async (req, res) => {
    const { users } = req.body;
    if (!users || !Array.isArray(users) || !users.length) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No data to import",
          zh: "没有数据",
        },
      });
    }

    const results = {
      success: [],
      failed: [],
      skipped: [],
    };

    for (const user of users) {
      const { userid, totalDeposit } = user;

      if (!userid || totalDeposit === undefined) {
        results.failed.push({
          userid,
          reason: "Missing userid or totalDeposit",
        });
        continue;
      }

      try {
        const existingUser = await User.findOne({ userid: parseInt(userid) });

        if (!existingUser) {
          results.skipped.push({ userid, reason: "User not found" });
          continue;
        }

        await User.updateMany(
          { userid: parseInt(userid) },
          { $set: { totaldeposit: parseFloat(totalDeposit) } }
        );

        results.success.push({ userid, totalDeposit });
      } catch (error) {
        console.error(
          `Import totalDeposit error for ${userid}:`,
          error.message
        );
        results.failed.push({ userid, reason: error.message });
      }
    }

    res.status(200).json({
      success: true,
      message: {
        en: `Import complete. Success: ${results.success.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`,
        zh: `导入完成。成功: ${results.success.length}, 跳过: ${results.skipped.length}, 失败: ${results.failed.length}`,
      },
      data: results,
    });
  }
);

// Import用户totalWithdraw数据
router.post("/admin/api/import-totalwithdraw", async (req, res) => {
  const { users } = req.body;
  if (!users || !Array.isArray(users) || !users.length) {
    return res.status(200).json({
      success: false,
      message: {
        en: "No data to import",
        zh: "没有数据",
      },
    });
  }
  const results = {
    success: [],
    failed: [],
    skipped: [],
  };
  for (const user of users) {
    const { userid, totalWithdraw } = user;
    if (!userid || totalWithdraw === undefined) {
      results.failed.push({
        userid,
        reason: "Missing userid or totalWithdraw",
      });
      continue;
    }

    const cleanWithdraw = Math.abs(parseFloat(totalWithdraw));

    try {
      const existingUser = await User.findOne({ userid: parseInt(userid) });
      if (!existingUser) {
        results.skipped.push({ userid, reason: "User not found" });
        continue;
      }
      await User.updateMany(
        { userid: parseInt(userid) },
        { $set: { totalwithdraw: cleanWithdraw } }
      );
      results.success.push({ userid, totalWithdraw: cleanWithdraw });
    } catch (error) {
      console.error(`Import totalWithdraw error for ${userid}:`, error.message);
      results.failed.push({ userid, reason: error.message });
    }
  }
  res.status(200).json({
    success: true,
    message: {
      en: `Import complete. Success: ${results.success.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`,
      zh: `导入完成。成功: ${results.success.length}, 跳过: ${results.skipped.length}, 失败: ${results.failed.length}`,
    },
    data: results,
  });
});

// 注册游戏
router.post(
  "/admin/api/register-kiosks-batch",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kiosks = await Kiosk.find({
        isActive: true,
        registerGameAPI: { $exists: true, $ne: "" },
      });
      if (!kiosks.length) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No active kiosks found",
            zh: "没有找到活跃的 Kiosk",
          },
        });
      }

      const users = await User.find({
        $or: [
          { jokerGameName: { $exists: false } },
          { jokerGameName: null },
          { jokerGameName: "" },
        ],
      });

      console.log(
        `[Batch Register] 找到 ${users.length} 个没有 jokerGameName 的用户`
      );
      console.log(
        `[Batch Register] 活跃 Kiosks: ${kiosks.map((k) => k.name).join(", ")}`
      );

      const API_URL = process.env.API_URL || "http://localhost:3001/api/";
      const results = {
        success: [],
        failed: [],
      };

      // delay function
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      for (const user of users) {
        console.log(
          `\n[Batch Register] 处理用户: ${user.userid} - ${user.fullname}`
        );

        const userResults = {
          userid: user.userid,
          fullname: user.fullname,
          kiosks: [],
        };

        for (const kiosk of kiosks) {
          try {
            const url = `${API_URL}${kiosk.registerGameAPI}/${user._id}`;
            console.log(`[Batch Register] Calling: ${url}`);

            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: req.headers.authorization,
              },
              body: JSON.stringify({}),
            });
            const text = await response.text();
            console.log(`[Batch Register] ${kiosk.name} response:`, text);

            try {
              const result = JSON.parse(text);
              userResults.kiosks.push({
                name: kiosk.name,
                success: result.success || false,
                message: result.message || text,
              });
            } catch (parseError) {
              userResults.kiosks.push({
                name: kiosk.name,
                success: false,
                message: "Invalid JSON response",
              });
            }
          } catch (error) {
            console.log(`[Batch Register] ${kiosk.name} error:`, error.message);
            userResults.kiosks.push({
              name: kiosk.name,
              success: false,
              message: error.message,
            });
          }
        }

        const allSuccess = userResults.kiosks.every((k) => k.success);
        if (allSuccess) {
          results.success.push(userResults);
        } else {
          results.failed.push(userResults);
        }

        // 等 2 秒再处理下一个用户
        await delay(2000);
      }

      console.log(
        `\n[Batch Register] 完成！成功: ${results.success.length}, 失败: ${results.failed.length}`
      );

      res.status(200).json({
        success: true,
        message: {
          en: `Batch registration complete. Success: ${results.success.length}, Failed: ${results.failed.length}`,
          zh: `批量注册完成。成功: ${results.success.length}, 失败: ${results.failed.length}`,
        },
        data: {
          totalUsers: users.length,
          totalKiosks: kiosks.length,
          results,
        },
      });
    } catch (error) {
      console.error("Batch kiosk registration error:", error);
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

// 检查哪个还没注册的
router.post(
  "/admin/api/register-kiosks-batch2",
  authenticateAdminToken,
  async (req, res) => {
    try {
      // 找没有 jokerGameName 或 jokerGameTwoName 的用户
      const users = await User.find({
        $or: [
          { jokerGameName: { $exists: false } },
          { jokerGameName: null },
          { jokerGameName: "" },
          { jokerGameTwoName: { $exists: false } },
          { jokerGameTwoName: null },
          { jokerGameTwoName: "" },
        ],
      });

      const userIds = users.map((u) => ({
        id: u._id,
        userid: u.userid,
        needJokerX2: !u.jokerGameName,
        needJokerX5: !u.jokerGameTwoName,
      }));

      console.log(`[Batch Register] 找到 ${users.length} 个需要注册的用户:`);
      console.log(JSON.stringify(userIds, null, 2));

      // return res.status(200).json({
      //   success: true,
      //   total: users.length,
      //   users: userIds,
      // });
      const API_URL = process.env.API_URL || "http://localhost:3001/";
      const results = {
        success: [],
        failed: [],
      };

      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      for (const user of users) {
        console.log(
          `\n[Batch Register] 处理用户: ${user.userid} - ${user.fullname}`
        );

        const userResults = {
          userid: user.userid,
          fullname: user.fullname,
          registered: [],
        };

        // 检查 jokerGameName
        if (!user.jokerGameName) {
          try {
            const url = `${API_URL}jokerx2/register/${user._id}`;
            console.log(`[Batch Register] Calling jokerx2: ${url}`);

            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: req.headers.authorization,
              },
              body: JSON.stringify({}),
            });
            const text = await response.text();
            console.log(`[Batch Register] jokerx2 response:`, text);

            const result = JSON.parse(text);
            userResults.registered.push({
              kiosk: "jokerx2",
              success: result.success || false,
              message: result.message || text,
            });
          } catch (error) {
            console.log(`[Batch Register] jokerx2 error:`, error.message);
            userResults.registered.push({
              kiosk: "jokerx2",
              success: false,
              message: error.message,
            });
          }

          await delay(2000);
        }

        // 检查 jokerGameTwoName
        if (!user.jokerGameTwoName) {
          try {
            const url = `${API_URL}jokerx5/register/${user._id}`;
            console.log(`[Batch Register] Calling jokerx5: ${url}`);

            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: req.headers.authorization,
              },
              body: JSON.stringify({}),
            });
            const text = await response.text();
            console.log(`[Batch Register] jokerx5 response:`, text);

            const result = JSON.parse(text);
            userResults.registered.push({
              kiosk: "jokerx5",
              success: result.success || false,
              message: result.message || text,
            });
          } catch (error) {
            console.log(`[Batch Register] jokerx5 error:`, error.message);
            userResults.registered.push({
              kiosk: "jokerx5",
              success: false,
              message: error.message,
            });
          }

          await delay(2000);
        }

        const allSuccess = userResults.registered.every((r) => r.success);
        if (allSuccess) {
          results.success.push(userResults);
        } else {
          results.failed.push(userResults);
        }
      }

      console.log(
        `\n[Batch Register] 完成！成功: ${results.success.length}, 失败: ${results.failed.length}`
      );

      res.status(200).json({
        success: true,
        message: {
          en: `Batch registration complete. Success: ${results.success.length}, Failed: ${results.failed.length}`,
          zh: `批量注册完成。成功: ${results.success.length}, 失败: ${results.failed.length}`,
        },
        data: {
          totalUsers: users.length,
          results,
        },
      });
    } catch (error) {
      console.error("Batch kiosk registration error:", error);
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

// Adjust Total Deposit
router.patch(
  "/admin/api/adjust-total-deposit/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount, remark } = req.body;

      if (!amount || isNaN(amount)) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Please enter a valid amount",
            zh: "请输入有效金额",
          },
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: {
            en: "User not found",
            zh: "用户不存在",
          },
        });
      }

      const currentTotal = Number(user.totaldeposit) || 0;
      const adjustAmount = Number(amount);
      const newTotal = currentTotal + adjustAmount;

      await User.findByIdAndUpdate(userId, {
        totaldeposit: newTotal,
      });

      await UserWalletLog.create({
        userId: user._id,
        transactionid: `ADJ_DEP_${Date.now()}`,
        transactiontime: new Date(),
        transactiontype: "adjust deposit",
        amount: String(adjustAmount),
        status: "success",
        game: "-",
        promotionnameCN:
          remark || `管理员调整总存款: ${currentTotal} → ${newTotal}`,
        promotionnameEN:
          remark ||
          `Admin adjusted total deposit: ${currentTotal} → ${newTotal}`,
      });

      res.json({
        success: true,
        message: {
          en: `Total deposit adjusted: ${currentTotal} → ${newTotal}`,
          zh: `总存款已调整: ${currentTotal} → ${newTotal}`,
        },
        data: {
          previousTotal: currentTotal,
          adjustAmount: adjustAmount,
          newTotal: newTotal,
        },
      });
    } catch (error) {
      console.error("Error adjusting total deposit:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to adjust total deposit",
          zh: "调整总存款失败",
        },
      });
    }
  }
);

// Adjust Total Withdraw
router.patch(
  "/admin/api/adjust-total-withdraw/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount, remark } = req.body;

      if (!amount || isNaN(amount)) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Please enter a valid amount",
            zh: "请输入有效金额",
          },
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: {
            en: "User not found",
            zh: "用户不存在",
          },
        });
      }

      const currentTotal = Number(user.totalwithdraw) || 0;
      const adjustAmount = Number(amount);
      const newTotal = currentTotal + adjustAmount;

      await User.findByIdAndUpdate(userId, {
        totalwithdraw: newTotal,
      });

      await UserWalletLog.create({
        userId: user._id,
        transactionid: `ADJ_WD_${Date.now()}`,
        transactiontime: new Date(),
        transactiontype: "adjust withdraw",
        amount: String(adjustAmount),
        status: "success",
        game: "-",
        promotionnameCN:
          remark || `管理员调整总提款: ${currentTotal} → ${newTotal}`,
        promotionnameEN:
          remark ||
          `Admin adjusted total withdraw: ${currentTotal} → ${newTotal}`,
      });

      res.json({
        success: true,
        message: {
          en: `Total withdraw adjusted: ${currentTotal} → ${newTotal}`,
          zh: `总提款已调整: ${currentTotal} → ${newTotal}`,
        },
        data: {
          previousTotal: currentTotal,
          adjustAmount: adjustAmount,
          newTotal: newTotal,
        },
      });
    } catch (error) {
      console.error("Error adjusting total withdraw:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to adjust total withdraw",
          zh: "调整总提款失败",
        },
      });
    }
  }
);

// Batch Update All Users VIP Level
router.post(
  "/admin/api/update-all-vip-levels",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const users = await User.find({});

      let updatedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const updateResults = [];

      for (const user of users) {
        const result = await checkAndUpdateVIPLevel(user._id);

        if (result.success) {
          if (result.message === "VIP level updated") {
            updatedCount++;
            updateResults.push({
              userid: user.userid,
              username: user.username,
              oldLevel: result.oldLevel || "None",
              newLevel: result.newLevel,
              totalDeposit: user.totaldeposit,
            });
          } else {
            skippedCount++;
          }
        } else {
          errorCount++;
        }
      }

      res.json({
        success: true,
        message: {
          en: `VIP levels updated. Updated: ${updatedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`,
          zh: `VIP等级已更新。已更新: ${updatedCount}, 已跳过: ${skippedCount}, 错误: ${errorCount}`,
        },
        data: {
          totalUsers: users.length,
          updatedCount,
          skippedCount,
          errorCount,
          updates: updateResults,
        },
      });
    } catch (error) {
      console.error("Error updating all VIP levels:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update VIP levels",
          zh: "更新VIP等级失败",
        },
      });
    }
  }
);

// Adjust all user firstDepositDate to date now
router.post(
  "/update-all-first-deposit-date",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const now = new Date();

      const result = await User.updateMany(
        { firstDepositDate: null },
        { $set: { firstDepositDate: now } }
      );

      res.json({
        success: true,
        message: {
          en: `Updated ${result.modifiedCount} users' firstDepositDate`,
          zh: `已更新 ${result.modifiedCount} 个用户的首存日期`,
        },
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          firstDepositDate: now,
        },
      });
    } catch (error) {
      console.error("Error updating first deposit dates:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update first deposit dates",
          zh: "更新首存日期失败",
        },
      });
    }
  }
);

// Turn all new deposit to false
router.post(
  "/update-all-deposit-new-deposit",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const result = await Deposit.updateMany(
        { newDeposit: true },
        { $set: { newDeposit: false } }
      );

      res.json({
        success: true,
        message: {
          en: `Updated ${result.modifiedCount} deposits' newDeposit to false`,
          zh: `已更新 ${result.modifiedCount} 个存款记录的 newDeposit 为 false`,
        },
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
      });
    } catch (error) {
      console.error("Error updating deposit newDeposit:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update deposit newDeposit",
          zh: "更新存款 newDeposit 失败",
        },
      });
    }
  }
);

// Admin Change Transaction Bank
router.post(
  "/admin/api/change-transaction-bank",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found",
            zh: "未找到管理员用户",
          },
        });
      }

      const { transactionId, transactionType, newBankId } = req.body;

      if (!transactionId || !transactionType || !newBankId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid request data",
            zh: "请求数据无效",
          },
        });
      }

      if (!["deposit", "withdraw"].includes(transactionType)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid transaction type",
            zh: "交易类型无效",
          },
        });
      }

      const newBank = await BankList.findById(newBankId);
      if (!newBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "New bank not found",
            zh: "找不到新银行",
          },
        });
      }

      let transaction;
      const Model = transactionType === "deposit" ? Deposit : Withdraw;

      transaction = await Model.findOne({ transactionId });
      if (!transaction) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Transaction not found",
            zh: "找不到交易记录",
          },
        });
      }

      // Skip if from/to wallet
      if (!transaction.bankid) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Cannot change bank for wallet transactions",
            zh: "钱包交易无法更改银行",
          },
        });
      }

      const oldBankId = transaction.bankid;

      // Same bank check
      if (oldBankId.toString() === newBankId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "New bank is the same as current bank",
            zh: "新银行与当前银行相同",
          },
        });
      }

      const bankLog = await BankTransactionLog.findOne({
        transactionId: transactionId,
      });
      if (!bankLog) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank transaction log not found, cannot change bank for old transactions",
            zh: "找不到银行交易记录，无法更改旧交易的银行",
          },
        });
      }

      const oldBank = await BankList.findById(oldBankId);
      if (!oldBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Original bank not found",
            zh: "找不到原银行",
          },
        });
      }

      const amount = transaction.bankAmount || transaction.amount;

      if (transactionType === "deposit") {
        // Reverse old bank: subtract deposit
        await BankList.findByIdAndUpdate(oldBankId, [
          {
            $set: {
              totalDeposits: { $subtract: ["$totalDeposits", amount] },
              currentbalance: {
                $subtract: [
                  {
                    $add: [
                      "$startingbalance",
                      { $subtract: ["$totalDeposits", amount] },
                      "$totalCashIn",
                    ],
                  },
                  {
                    $add: [
                      "$totalWithdrawals",
                      "$totalCashOut",
                      "$totalTransactionFees",
                    ],
                  },
                ],
              },
            },
          },
        ]);

        // Apply to new bank: add deposit
        await BankList.findByIdAndUpdate(newBankId, [
          {
            $set: {
              totalDeposits: { $add: ["$totalDeposits", amount] },
              currentbalance: {
                $subtract: [
                  {
                    $add: [
                      "$startingbalance",
                      { $add: ["$totalDeposits", amount] },
                      "$totalCashIn",
                    ],
                  },
                  {
                    $add: [
                      "$totalWithdrawals",
                      "$totalCashOut",
                      "$totalTransactionFees",
                    ],
                  },
                ],
              },
            },
          },
        ]);
      } else {
        // Withdraw: reverse old bank (add back)
        await BankList.findByIdAndUpdate(oldBankId, [
          {
            $set: {
              totalWithdrawals: { $subtract: ["$totalWithdrawals", amount] },
              currentbalance: {
                $subtract: [
                  {
                    $add: [
                      "$startingbalance",
                      "$totalDeposits",
                      "$totalCashIn",
                    ],
                  },
                  {
                    $add: [
                      { $subtract: ["$totalWithdrawals", amount] },
                      "$totalCashOut",
                      "$totalTransactionFees",
                    ],
                  },
                ],
              },
            },
          },
        ]);

        // Apply to new bank: subtract withdrawal
        await BankList.findByIdAndUpdate(newBankId, [
          {
            $set: {
              totalWithdrawals: { $add: ["$totalWithdrawals", amount] },
              currentbalance: {
                $subtract: [
                  {
                    $add: [
                      "$startingbalance",
                      "$totalDeposits",
                      "$totalCashIn",
                    ],
                  },
                  {
                    $add: [
                      { $add: ["$totalWithdrawals", amount] },
                      "$totalCashOut",
                      "$totalTransactionFees",
                    ],
                  },
                ],
              },
            },
          },
        ]);
      }

      // Update transaction record
      await Model.findByIdAndUpdate(transaction._id, {
        $set: {
          bankid: newBank._id,
          bankname: newBank.bankname,
          ownername: newBank.ownername,
          transfernumber: newBank.bankaccount,
          remark: `${transaction.remark || "-"} | Bank changed from ${
            oldBank.bankname
          } to ${newBank.bankname} by ${adminuser.username}`,
        },
      });

      // Update BankTransactionLog
      const updatedNewBank = await BankList.findById(newBankId);
      await BankTransactionLog.findByIdAndUpdate(bankLog._id, {
        $set: {
          bankName: newBank.bankname,
          ownername: newBank.ownername,
          bankAccount: newBank.bankaccount,
          qrimage: newBank.qrimage,
          remark: `${transaction.remark || "-"} | Bank changed by ${
            adminuser.username
          }`,
          currentBalance: updatedNewBank.currentbalance,
          lastBalance:
            transactionType === "deposit"
              ? updatedNewBank.currentbalance - amount
              : updatedNewBank.currentbalance + amount,
        },
      });

      res.status(200).json({
        success: true,
        message: {
          en: `Bank changed from ${oldBank.bankname} to ${newBank.bankname} for ${transactionType}`,
          zh: `${transactionType === "deposit" ? "存款" : "提款"}银行已从 ${
            oldBank.bankname
          } 更改为 ${newBank.bankname}`,
        },
        data: {
          transactionId,
          oldBank: oldBank.bankname,
          newBank: newBank.bankname,
          amount,
        },
      });
    } catch (error) {
      console.error("Error in change transaction bank:", error);
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

// Check Bank Deposit/Withdraw Limit
router.post(
  "/admin/api/check-bank-limit",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { bankId, amount, type } = req.body; // type: 'deposit' or 'withdraw'
      const checkAmount = parseFloat(amount) || 0;

      const bank = await BankList.findById(bankId);
      if (!bank) {
        return res.status(200).json({
          success: true,
          hasWarning: false,
        });
      }

      // 获取 UTC+8 的今天开始和结束时间
      const todayStart = moment().utcOffset(8).startOf("day").utc().toDate();
      const todayEnd = moment().utcOffset(8).endOf("day").utc().toDate();

      // 获取 UTC+8 的本月开始和结束时间
      const monthStart = moment().utcOffset(8).startOf("month").utc().toDate();
      const monthEnd = moment().utcOffset(8).endOf("month").utc().toDate();

      let dailyTotal = 0;
      let monthlyTotal = 0;
      let dailyLimit = 0;
      let monthlyLimit = 0;

      if (type === "deposit") {
        dailyLimit = bank.dailydepositamountlimit || 0;
        monthlyLimit = bank.monthlydepositamountlimit || 0;

        // 计算今日 deposit 总额
        const dailyDeposits = await Deposit.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              bankid: bankId,
              createdAt: { $gte: todayStart, $lte: todayEnd },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$bankAmount", "$amount"] } },
            },
          },
        ]);

        // 计算今日 cashin 总额
        const dailyCashIn = await BankTransactionLog.aggregate([
          {
            $match: {
              bankName: bank.bankname,
              ownername: bank.ownername,
              bankAccount: bank.bankaccount,
              transactiontype: { $in: ["cashin", "CashIn", "CASHIN"] },
              createdAt: { $gte: todayStart, $lte: todayEnd },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ]);

        dailyTotal =
          (dailyDeposits[0]?.total || 0) + (dailyCashIn[0]?.total || 0);

        // 计算本月 deposit 总额
        const monthlyDeposits = await Deposit.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              bankid: bankId,
              createdAt: { $gte: monthStart, $lte: monthEnd },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$bankAmount", "$amount"] } },
            },
          },
        ]);

        // 计算本月 cashin 总额
        const monthlyCashIn = await BankTransactionLog.aggregate([
          {
            $match: {
              bankName: bank.bankname,
              ownername: bank.ownername,
              bankAccount: bank.bankaccount,
              transactiontype: { $in: ["cashin", "CashIn", "CASHIN"] },
              createdAt: { $gte: monthStart, $lte: monthEnd },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ]);

        monthlyTotal =
          (monthlyDeposits[0]?.total || 0) + (monthlyCashIn[0]?.total || 0);
      } else if (type === "withdraw") {
        dailyLimit = bank.dailywithdrawamountlimit || 0;
        monthlyLimit = bank.monthlywithdrawamountlimit || 0;

        // 计算今日 withdraw 总额
        const dailyWithdraws = await Withdraw.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              bankid: bankId,
              createdAt: { $gte: todayStart, $lte: todayEnd },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$bankAmount", "$amount"] } },
            },
          },
        ]);

        // 计算今日 cashout 总额
        const dailyCashOut = await BankTransactionLog.aggregate([
          {
            $match: {
              bankName: bank.bankname,
              ownername: bank.ownername,
              bankAccount: bank.bankaccount,
              transactiontype: { $in: ["cashout", "CashOut", "CASHOUT"] },
              createdAt: { $gte: todayStart, $lte: todayEnd },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ]);

        dailyTotal =
          (dailyWithdraws[0]?.total || 0) + (dailyCashOut[0]?.total || 0);

        // 计算本月 withdraw 总额
        const monthlyWithdraws = await Withdraw.aggregate([
          {
            $match: {
              status: "approved",
              reverted: false,
              bankid: bankId,
              createdAt: { $gte: monthStart, $lte: monthEnd },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$bankAmount", "$amount"] } },
            },
          },
        ]);

        // 计算本月 cashout 总额
        const monthlyCashOut = await BankTransactionLog.aggregate([
          {
            $match: {
              bankName: bank.bankname,
              ownername: bank.ownername,
              bankAccount: bank.bankaccount,
              transactiontype: { $in: ["cashout", "CashOut", "CASHOUT"] },
              createdAt: { $gte: monthStart, $lte: monthEnd },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ]);

        monthlyTotal =
          (monthlyWithdraws[0]?.total || 0) + (monthlyCashOut[0]?.total || 0);
      }

      const warnings = [];

      // 检查 daily limit
      if (dailyLimit > 0 && dailyTotal + checkAmount > dailyLimit) {
        warnings.push({
          type: "daily",
          currentTotal: dailyTotal,
          newAmount: checkAmount,
          afterTotal: dailyTotal + checkAmount,
          limit: dailyLimit,
        });
      }

      // 检查 monthly limit
      if (monthlyLimit > 0 && monthlyTotal + checkAmount > monthlyLimit) {
        warnings.push({
          type: "monthly",
          currentTotal: monthlyTotal,
          newAmount: checkAmount,
          afterTotal: monthlyTotal + checkAmount,
          limit: monthlyLimit,
        });
      }

      res.status(200).json({
        success: true,
        hasWarning: warnings.length > 0,
        warnings,
        data: {
          dailyTotal,
          monthlyTotal,
          dailyLimit,
          monthlyLimit,
        },
      });
    } catch (error) {
      console.error("Error checking bank limit:", error);
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

// Fix Megapng Timezone
router.post(
  "/admin/api/fix-timezone",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const depositResult = await Deposit.collection.updateMany(
        {
          $expr: {
            $and: [
              { $gte: [{ $hour: "$createdAt" }, 14] },
              { $lte: [{ $hour: "$createdAt" }, 15] },
            ],
          },
        },
        [
          {
            $set: {
              createdAt: { $subtract: ["$createdAt", 24 * 60 * 60 * 1000] },
              updatedAt: { $subtract: ["$updatedAt", 24 * 60 * 60 * 1000] },
            },
          },
        ]
      );

      const withdrawResult = await Withdraw.collection.updateMany(
        {
          $expr: {
            $and: [
              { $gte: [{ $hour: "$createdAt" }, 14] },
              { $lte: [{ $hour: "$createdAt" }, 15] },
            ],
          },
        },
        [
          {
            $set: {
              createdAt: { $subtract: ["$createdAt", 24 * 60 * 60 * 1000] },
              updatedAt: { $subtract: ["$updatedAt", 24 * 60 * 60 * 1000] },
            },
          },
        ]
      );

      const walletLogResult = await UserWalletLog.collection.updateMany(
        {
          $expr: {
            $and: [
              { $gte: [{ $hour: "$createdAt" }, 14] },
              { $lte: [{ $hour: "$createdAt" }, 15] },
            ],
          },
        },
        [
          {
            $set: {
              transactiontime: {
                $subtract: ["$transactiontime", 24 * 60 * 60 * 1000],
              },
              createdAt: { $subtract: ["$createdAt", 24 * 60 * 60 * 1000] },
              updatedAt: { $subtract: ["$updatedAt", 24 * 60 * 60 * 1000] },
            },
          },
        ]
      );

      res.status(200).json({
        success: true,
        message: {
          en: `Fixed ${depositResult.modifiedCount} deposits, ${withdrawResult.modifiedCount} withdraws, ${walletLogResult.modifiedCount} wallet logs`,
          zh: `已修复 ${depositResult.modifiedCount} 条存款、${withdrawResult.modifiedCount} 条提款、${walletLogResult.modifiedCount} 条钱包日志`,
        },
        data: {
          deposits: depositResult.modifiedCount,
          withdraws: withdrawResult.modifiedCount,
          walletLogs: walletLogResult.modifiedCount,
        },
      });
    } catch (error) {
      console.error("Error fixing timezone:", error);
      res.status(500).json({
        success: false,
        message: { en: "Error", zh: "错误" },
        error: error.message,
      });
    }
  }
);

// Admin Get User Today Withdraw Limit
router.get(
  "/admin/api/user-daily-withdraw-count/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const withdrawCountLimit = 10;
      const pngTimezone = "Pacific/Port_Moresby";
      const todayStart = moment().tz(pngTimezone).startOf("day").utc();
      const todayEnd = moment().tz(pngTimezone).endOf("day").utc();
      const todayWithdrawalCount = await Withdraw.countDocuments({
        userId: user._id,
        status: "approved",
        bankname: { $ne: "User Wallet" },
        createdAt: {
          $gte: todayStart.toDate(),
          $lte: todayEnd.toDate(),
        },
      });

      res.status(200).json({
        success: true,
        data: {
          userId: user._id,
          userid: user.userid,
          username: user.username,
          todayCount: todayWithdrawalCount,
          limit: withdrawCountLimit,
          remaining: Math.max(0, withdrawCountLimit - todayWithdrawalCount),
          limitReached: todayWithdrawalCount >= withdrawCountLimit,
        },
      });
    } catch (error) {
      console.error("Error getting daily withdraw count:", error);
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
module.exports = router;
module.exports.checkAndUpdateVIPLevel = checkAndUpdateVIPLevel;
