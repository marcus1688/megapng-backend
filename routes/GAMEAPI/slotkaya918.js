const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const slotKaya918Modal = require("../../models/slot_918kaya.model");
const GameSyncLog = require("../../models/game_syncdata.model");
const cron = require("node-cron");

require("dotenv").config();

//Staging
const kaya918AESKey = process.env.KAYA918_AES;
const kaya918MD5Key = process.env.KAYA918_MD5;
const kaya918AgentID = "megapng";
const kaya918APIURL = "http://apiservice.jra444.com/";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRandomPassword() {
  return `Qwer1122`;
}

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}

async function GameWalletLogAttempt(
  username,
  transactiontype,
  remark,
  amount,
  gamename,
  gamebalance,
  beforewalletbalance,
  afterwalletbalance
) {
  await GameWalletLog.create({
    username,
    transactiontype,
    remark: remark || "",
    amount,
    gamename: gamename,
    gamebalance,
    beforewalletbalance,
    afterwalletbalance,
  });
}

const kaya918KickPlayer = async (user) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const registerID = user.gameId.toLowerCase();

    const requestBody = {
      agentID: kaya918AgentID,
      accountName: registerID,
      timeStamp: timestamp,
    };

    const bodyJson = JSON.stringify(requestBody);
    const cipher = crypto.createCipheriv("aes-128-ecb", kaya918AESKey, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(bodyJson, "utf8", "base64");
    encrypted += cipher.final("base64");

    const aesEncode = crypto
      .createHash("md5")
      .update(encrypted + kaya918MD5Key)
      .digest("hex")
      .toLowerCase();

    const response = await axios.post(
      `${kaya918APIURL}v1/kickoffline`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          "AES-ENCODE": aesEncode,
          "Accept-Encoding": "gzip",
        },
      }
    );

    if (response.data.errorCode !== 0) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("918KAYA error checking user balance", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};
const kaya918CheckBalance = async (user) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const registerID = user.gameId.toLowerCase();

    const requestBody = {
      agentID: kaya918AgentID,
      accountName: registerID,
      timeStamp: timestamp,
    };

    const bodyJson = JSON.stringify(requestBody);
    const cipher = crypto.createCipheriv("aes-128-ecb", kaya918AESKey, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(bodyJson, "utf8", "base64");
    encrypted += cipher.final("base64");

    const aesEncode = crypto
      .createHash("md5")
      .update(encrypted + kaya918MD5Key)
      .digest("hex")
      .toLowerCase();

    const response = await axios.post(
      `${kaya918APIURL}v1/accountbalance`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          "AES-ENCODE": aesEncode,
          "Accept-Encoding": "gzip",
        },
      }
    );

    if (response.data.errorCode !== 0) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("918KAYA error checking user balance", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

async function kaya918Deposit(user, trfamount) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const registerID = user.gameId.toLowerCase();

    const txID = generateTransactionId("megapng");

    const requestBody = {
      agentID: kaya918AgentID,
      accountName: registerID,
      transAmount: trfamount,
      transAgentID: txID,
      timeStamp: timestamp,
    };

    const bodyJson = JSON.stringify(requestBody);
    const cipher = crypto.createCipheriv("aes-128-ecb", kaya918AESKey, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(bodyJson, "utf8", "base64");
    encrypted += cipher.final("base64");

    const aesEncode = crypto
      .createHash("md5")
      .update(encrypted + kaya918MD5Key)
      .digest("hex")
      .toLowerCase();

    const response = await axios.post(
      `${kaya918APIURL}v1/transferdeposit`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          "AES-ENCODE": aesEncode,
          "Accept-Encoding": "gzip",
        },
      }
    );
    if (response.data.errorCode !== 0) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("kaya918 error in deposit:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function kaya918Withdraw(user, trfamount) {
  try {
    const kickResult = await kaya918KickPlayer(user);
    if (!kickResult.success) {
      console.log(
        "918KAYA: Kick player failed, continuing with withdraw:",
        kickResult.error
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const timestamp = Math.floor(Date.now() / 1000);

    const registerID = user.gameId.toLowerCase();

    const txID = generateTransactionId("megapng");

    const requestBody = {
      agentID: kaya918AgentID,
      accountName: registerID,
      transAmount: trfamount,
      transAgentID: txID,
      timeStamp: timestamp,
    };

    const bodyJson = JSON.stringify(requestBody);
    const cipher = crypto.createCipheriv("aes-128-ecb", kaya918AESKey, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(bodyJson, "utf8", "base64");
    encrypted += cipher.final("base64");

    const aesEncode = crypto
      .createHash("md5")
      .update(encrypted + kaya918MD5Key)
      .digest("hex")
      .toLowerCase();

    const response = await axios.post(
      `${kaya918APIURL}v1/transferwithdraw`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          "AES-ENCODE": aesEncode,
          "Accept-Encoding": "gzip",
        },
      }
    );

    if (response.data.errorCode !== 0) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("kaya918 error in withdraw:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

const kaya918RegisterUser = async (user) => {
  try {
    const randomPass = generateRandomPassword();
    const timestamp = Math.floor(Date.now() / 1000);

    const registerID = user.gameId.toLowerCase();

    const requestBody = {
      agentID: kaya918AgentID,
      accountName: registerID,
      accountPW: randomPass,
      accountDisplay: user.gameId,
      timeStamp: timestamp,
    };

    const bodyJson = JSON.stringify(requestBody);
    const cipher = crypto.createCipheriv("aes-128-ecb", kaya918AESKey, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(bodyJson, "utf8", "base64");
    encrypted += cipher.final("base64");

    const aesEncode = crypto
      .createHash("md5")
      .update(encrypted + kaya918MD5Key)
      .digest("hex")
      .toLowerCase();

    const response = await axios.post(
      `${kaya918APIURL}v1/accountcreate`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          "AES-ENCODE": aesEncode,
          "Accept-Encoding": "gzip",
        },
      }
    );

    if (response.data.errorCode !== 0 && response.data.errorCode !== 903) {
      return {
        success: false,
        error: response.data,
      };
    }

    const updateFields = {
      $set: {
        kaya918GameName: registerID,
        kaya918GamePW: randomPass,
      },
    };

    if (user.kaya918GameName && user.kaya918GamePW) {
      updateFields.$push = {
        pastKaya918GameName: user.kaya918GameName,
        pastKaya918GamePW: user.kaya918GamePW,
      };
    }

    await User.findByIdAndUpdate(user._id, updateFields, { new: true });

    return {
      success: true,
      userData: {
        userId: registerID,
        password: randomPass,
      },
    };
  } catch (error) {
    console.log("918KAYA error in registering user", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

async function setKaya918Password(user, password) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const registerID = user.gameId.toLowerCase();

    const requestBody = {
      agentID: kaya918AgentID,
      accountName: registerID,
      accountPW: password,
      timeStamp: timestamp,
    };

    const bodyJson = JSON.stringify(requestBody);
    const cipher = crypto.createCipheriv("aes-128-ecb", kaya918AESKey, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(bodyJson, "utf8", "base64");
    encrypted += cipher.final("base64");

    const aesEncode = crypto
      .createHash("md5")
      .update(encrypted + kaya918MD5Key)
      .digest("hex")
      .toLowerCase();

    const response = await axios.post(
      `${kaya918APIURL}v1/accountpassword`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          "AES-ENCODE": aesEncode,
          "Accept-Encoding": "gzip",
        },
      }
    );

    if (response.data.errorCode !== 0) {
      return {
        success: false,
        error: response.data,
      };
    }

    await User.updateMany(
      { gameId: user.gameId },
      { $set: { kaya918GamePW: password } }
    );

    return { success: true, data: response.data, password: password };
  } catch (error) {
    console.error("KAYA918 error in setting password:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post(
  "/admin/api/kaya918/manualregister/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found. Please try again or contact customer service for assistance.",
            zh: "用户未找到，请重试或联系客服以获取帮助。",
            ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const registerResponse = await kaya918RegisterUser(user);

      if (!registerResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KAYA: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "918KAYA: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "918KAYA: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "918KAYA: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "918KAYA: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "918KAYA: Account registered successfully.",
          zh: "918KAYA: 账户注册成功。",
          ms: "918KAYA: Akaun berjaya didaftarkan.",
          zh_hk: "918KAYA: 帳戶註冊成功。",
          id: "918KAYA: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: registerResponse.userData.userId,
          password: registerResponse.userData.password,
        },
      });
    } catch (error) {
      console.log("918KAYA error in registering user", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "918KAYA: Registration failed. Please try again or contact customer support for assistance.",
          zh: "918KAYA: 注册失败。请重试或联系客服寻求帮助。",
          ms: "918KAYA: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "918KAYA: 註冊失敗。請重試或聯絡客服尋求協助。",
          id: "918KAYA: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/kaya918/register/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found. Please try again or contact customer service for assistance.",
            zh: "用户未找到，请重试或联系客服以获取帮助。",
            ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const registerResponse = await kaya918RegisterUser(user);

      if (!registerResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KAYA: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "918KAYA: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "918KAYA: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "918KAYA: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "918KAYA: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "918KAYA: Account registered successfully.",
          zh: "918KAYA: 账户注册成功。",
          ms: "918KAYA: Akaun berjaya didaftarkan.",
          zh_hk: "918KAYA: 帳戶註冊成功。",
          id: "918KAYA: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: registerResponse.userData.userId,
          password: registerResponse.userData.password,
        },
      });
    } catch (error) {
      console.log("918KAYA error in registering user", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "918KAYA: Registration failed. Please try again or contact customer support for assistance.",
          zh: "918KAYA: 注册失败。请重试或联系客服寻求帮助。",
          ms: "918KAYA: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "918KAYA: 註冊失敗。請重試或聯絡客服尋求協助。",
          id: "918KAYA: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/kaya918/getbalance/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found. Please try again or contact customer service for assistance.",
            zh: "用户未找到，请重试或联系客服以获取帮助。",
            ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const balanceResponse = await kaya918CheckBalance(user);

      if (!balanceResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KAYA: Unable to retrieve player balance. Please try again or contact customer support for assistance.",
            zh: "918KAYA: 无法获取玩家余额。请重试或联系客服寻求帮助。",
            ms: "918KAYA: Tidak dapat mendapatkan baki pemain. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
            zh_hk: "918KAYA: 無法獲取玩家餘額。請重試或聯絡客服尋求協助。",
            id: "918KAYA: Tidak dapat mengambil saldo pemain. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        balance: balanceResponse.data.balance / 10000 || 0,
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
          zh_hk: "餘額查詢成功。",
          id: "Saldo berhasil diambil.",
        },
      });
    } catch (error) {
      console.error("918KAYA error checking user balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "918KAYA: Unable to retrieve player balance. Please try again or contact customer support for assistance.",
          zh: "918KAYA: 无法获取玩家余额。请重试或联系客服寻求帮助。",
          ms: "918KAYA: Tidak dapat mendapatkan baki pemain. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "918KAYA: 無法獲取玩家餘額。請重試或聯絡客服尋求協助。",
          id: "918KAYA: Tidak dapat mengambil saldo pemain. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/kaya918/deposit/:userId",
  authenticateAdminToken,
  async (req, res) => {
    let formattedDepositAmount = 0;
    try {
      const { transferAmount, remark } = req.body;
      formattedDepositAmount = roundToTwoDecimals(transferAmount);

      if (isNaN(formattedDepositAmount) || formattedDepositAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit amount must be a positive number greater than 0.",
            zh: "存款金额必须为正数且大于0。",
            ms: "Jumlah deposit mestilah nombor positif dan lebih besar daripada 0.",
            zh_hk: "存款金額必須為正數且大於0。",
            id: "Jumlah deposit harus berupa angka positif dan lebih besar dari 0.",
          },
        });
      }

      const { userId } = req.params;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found. Please try again or contact customer service for assistance.",
            zh: "用户未找到，请重试或联系客服以获取帮助。",
            ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      if (!user.kaya918GameName) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KAYA: Game account not registered. Please register an account first to proceed.",
            zh: "918KAYA: 游戏账户未注册。请先注册账户以继续。",
            ms: "918KAYA: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "918KAYA: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "918KAYA: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      if (user.gameStatus.kaya918.transferInStatus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Transfer is temporarily locked. Please contact customer support for assistance.",
            zh: "转账暂时锁定。请联系客服寻求帮助。",
            ms: "Pemindahan dikunci buat sementara. Sila hubungi sokongan pelanggan untuk bantuan.",
            zh_hk: "轉帳暫時鎖定。請聯絡客服尋求協助。",
            id: "Transfer terkunci sementara. Silakan hubungi dukungan pelanggan untuk bantuan.",
          },
        });
      }

      const depositAmountInCents = Math.round(formattedDepositAmount * 10000);

      const depositResponse = await kaya918Deposit(user, depositAmountInCents);

      if (!depositResponse.success) {
        console.log(depositResponse, "dedposti failed");

        return res.status(200).json({
          success: false,
          message: {
            en: "918KAYA: Deposit failed. Please try again or contact customer support for further assistance.",
            zh: "918KAYA: 存款失败。请重试或联系客服寻求进一步帮助。",
            ms: "918KAYA: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "918KAYA: 存款失敗。請重試或聯絡客服尋求進一步協助。",
            id: "918KAYA: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }
      try {
        await GameWalletLogAttempt(
          user.username,
          "Transfer In",
          remark || "Transfer",
          roundToTwoDecimals(formattedDepositAmount),
          "918KAYA",
          roundToTwoDecimals(depositResponse.data.afterBalance / 10000 || 0),
          0,
          0
        );
      } catch (logError) {
        console.error("918KAYA: Failed to log transaction:", logError.message);
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "918KAYA: Deposit completed successfully.",
          zh: "918KAYA: 存款成功完成。",
          ms: "918KAYA: Deposit berjaya diselesaikan.",
          zh_hk: "918KAYA: 存款成功完成。",
          id: "918KAYA: Deposit berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("918KAYA error in deposit", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "918KAYA: Deposit failed. Please try again or contact customer support for further assistance.",
          zh: "918KAYA: 存款失败。请重试或联系客服寻求进一步帮助。",
          ms: "918KAYA: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "918KAYA: 存款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "918KAYA: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/kaya918/withdraw/:userId",
  authenticateAdminToken,
  async (req, res) => {
    let formattedWithdrawAmount = 0;
    try {
      const { transferAmount, remark } = req.body;
      formattedWithdrawAmount = roundToTwoDecimals(transferAmount);

      if (isNaN(formattedWithdrawAmount) || formattedWithdrawAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal amount must be a positive number greater than 0.",
            zh: "提款金额必须为正数且大于0。",
            ms: "Jumlah pengeluaran mestilah nombor positif dan lebih besar daripada 0.",
            zh_hk: "提款金額必須為正數且大於0。",
            id: "Jumlah penarikan harus berupa angka positif dan lebih besar dari 0.",
          },
        });
      }

      const { userId } = req.params;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found. Please try again or contact customer service for assistance.",
            zh: "用户未找到，请重试或联系客服以获取帮助。",
            ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      if (!user.kaya918GameName) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KAYA: Game account not registered. Please register an account first to proceed.",
            zh: "918KAYA: 游戏账户未注册。请先注册账户以继续。",
            ms: "918KAYA: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "918KAYA: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "918KAYA: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      if (user.gameStatus.kaya918.transferOutStatus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Transfer is temporarily locked. Please contact customer support for assistance.",
            zh: "转账暂时锁定。请联系客服寻求帮助。",
            ms: "Pemindahan dikunci buat sementara. Sila hubungi sokongan pelanggan untuk bantuan.",
            zh_hk: "轉帳暫時鎖定。請聯絡客服尋求協助。",
            id: "Transfer terkunci sementara. Silakan hubungi dukungan pelanggan untuk bantuan.",
          },
        });
      }

      const depositAmountInCents = Math.round(formattedWithdrawAmount * 10000);

      const withdrawResponse = await kaya918Withdraw(
        user,
        depositAmountInCents
      );

      if (!withdrawResponse.success) {
        console.error("918KAYA: Withdraw failed -", withdrawResponse.error);

        if (withdrawResponse.error.errorCode === 1035) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Insufficient game balance to complete withdrawal.",
              zh: "游戏余额不足，无法完成提款。",
              ms: "Baki permainan tidak mencukupi untuk melengkapkan pengeluaran.",
              zh_hk: "遊戲餘額不足，無法完成提款。",
              id: "Saldo permainan tidak mencukupi untuk menyelesaikan penarikan.",
            },
          });
        }

        return res.status(200).json({
          success: false,
          message: {
            en: "918KAYA: Withdrawal failed. Please try again or contact customer support for further assistance.",
            zh: "918KAYA: 提款失败。请重试或联系客服寻求进一步帮助。",
            ms: "918KAYA: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "918KAYA: 提款失敗。請重試或聯絡客服尋求進一步協助。",
            id: "918KAYA: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      try {
        await GameWalletLogAttempt(
          user.username,
          "Transfer Out",
          remark || "Transfer",
          roundToTwoDecimals(formattedWithdrawAmount),
          "918KAYA",
          roundToTwoDecimals(withdrawResponse.data.afterBalance / 10000 || 0),
          0,
          0
        );
      } catch (logError) {
        console.error("918KAYA: Failed to log transaction:", logError.message);
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "918KAYA: Withdrawal completed successfully.",
          zh: "918KAYA: 提款成功完成。",
          ms: "918KAYA: Pengeluaran berjaya diselesaikan.",
          zh_hk: "918KAYA: 提款成功完成。",
          id: "918KAYA: Penarikan berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("918KAYA error in transferout", error.message);

      return res.status(200).json({
        success: false,
        message: {
          en: "918KAYA: Withdrawal failed. Please try again or contact customer support for further assistance.",
          zh: "918KAYA: 提款失败。请重试或联系客服寻求进一步帮助。",
          ms: "918KAYA: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "918KAYA: 提款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "918KAYA: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/kaya918/updatepassword/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;

      const { newpassword } = req.body;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found. Please try again or contact customer service for assistance.",
            zh: "用户未找到，请重试或联系客服以获取帮助。",
            ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      if (!newpassword) {
        return res.status(200).json({
          success: false,
          message: {
            en: "New password is required.",
            zh: "需要新密码。",
            ms: "Kata laluan baharu diperlukan.",
            zh_hk: "需要新密碼。",
            id: "Kata sandi baru diperlukan.",
          },
        });
      }

      const updatePasswordResponse = await setKaya918Password(
        user,
        newpassword
      );

      if (!updatePasswordResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KAYA: Failed to update password. Please try again or contact customer support for assistance.",
            zh: "918KAYA: 更新密码失败。请重试或联系客服寻求帮助。",
            ms: "918KAYA: Gagal mengemas kini kata laluan. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
            zh_hk: "918KAYA: 更新密碼失敗。請重試或聯絡客服尋求協助。",
            id: "918KAYA: Gagal memperbarui kata sandi. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "918KAYA: Password updated successfully.",
          zh: "918KAYA: 密码更新成功。",
          ms: "918KAYA: Kata laluan berjaya dikemas kini.",
          zh_hk: "918KAYA: 密碼更新成功。",
          id: "918KAYA: Kata sandi berhasil diperbarui.",
        },
      });
    } catch (error) {
      console.log("918KAYA error updating password:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "918KAYA: Failed to update password due to a technical issue. Please try again or contact customer support for assistance.",
          zh: "918KAYA: 由于技术问题更新密码失败。请重试或联系客服寻求帮助。",
          ms: "918KAYA: Gagal mengemas kini kata laluan kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk:
            "918KAYA: 由於技術問題更新密碼失敗。請重試或聯絡客服尋求協助。",
          id: "918KAYA: Gagal memperbarui kata sandi karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.get(
  "/admin/api/kaya918/setstatus/:playerId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { status } = req.body;
      const playerId = req.params.playerId;
      const currentPlayer = await User.findById(playerId);

      if (!currentPlayer) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found. Please try again or contact customer service for assistance.",
            zh: "用户未找到，请重试或联系客服以获取帮助。",
            ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const timestamp = Math.floor(Date.now() / 1000);

      const registerID = currentPlayer.gameId.toLowerCase();

      const requestBody = {
        agentID: kaya918AgentID,
        accountName: registerID,
        timeStamp: timestamp,
      };

      const bodyJson = JSON.stringify(requestBody);
      const cipher = crypto.createCipheriv("aes-128-ecb", kaya918AESKey, null);
      cipher.setAutoPadding(true);
      let encrypted = cipher.update(bodyJson, "utf8", "base64");
      encrypted += cipher.final("base64");

      const aesEncode = crypto
        .createHash("md5")
        .update(encrypted + kaya918MD5Key)
        .digest("hex")
        .toLowerCase();

      const method =
        status === true ? "v1/accountenable" : "v1/accountdisable ";

      const response = await axios.post(
        `${kaya918APIURL}${method}`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            "AES-ENCODE": aesEncode,
            "Accept-Encoding": "gzip",
          },
        }
      );

      if (response.data.errorCode !== 0) {
        console.log("failed to update status", response.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "918KAYA: Failed to update player status. Please try again or contact customer support.",
            zh: "918KAYA: 更新玩家状态失败。请重试或联系客服。",
            ms: "918KAYA: Gagal mengemas kini status pemain. Sila cuba lagi atau hubungi sokongan pelanggan.",
            zh_hk: "918KAYA: 更新玩家狀態失敗。請重試或聯絡客服。",
            id: "918KAYA: Gagal memperbarui status pemain. Silakan coba lagi atau hubungi dukungan pelanggan.",
          },
        });
      }

      await User.findByIdAndUpdate(playerId, {
        "gameSuspendStatus.kaya918.lock": status !== true,
      });

      const statusText = status === true ? "Enabled" : "Disabled";

      return res.status(200).json({
        success: true,
        message: {
          en: `918KAYA: Player status successfully updated to ${statusText}.`,
          zh: `918KAYA: 玩家状态已成功更新为${
            status === true ? "启用" : "禁用"
          }。`,
          ms: `918KAYA: Status pemain berjaya dikemas kini kepada ${
            status === true ? "Diaktifkan" : "Dilumpuhkan"
          }.`,
          zh_hk: `918KAYA: 玩家狀態已成功更新為${
            status === true ? "啟用" : "禁用"
          }。`,
          id: `918KAYA: Status pemain berhasil diperbarui menjadi ${
            status === true ? "Diaktifkan" : "Dinonaktifkan"
          }.`,
        },
      });
    } catch (error) {
      console.log("918KAYA: Failed to update player status:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KAYA: Failed to update player status due to a technical issue. Please try again or contact customer support.",
          zh: "918KAYA: 由于技术问题更新玩家状态失败。请重试或联系客服。",
          ms: "918KAYA: Gagal mengemas kini status pemain kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan.",
          zh_hk: "918KAYA: 由於技術問題更新玩家狀態失敗。請重試或聯絡客服。",
          id: "918KAYA: Gagal memperbarui status pemain karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/kaya918/setAsMain",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { selectedGameId, selectedPassword } = req.body;

      if (!selectedGameId || !selectedPassword) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game ID and password are required.",
            zh: "游戏ID和密码为必填项。",
            zh_hk: "遊戲ID和密碼為必填項。",
            ms: "ID permainan dan kata laluan diperlukan.",
            id: "ID permainan dan kata sandi diperlukan.",
          },
        });
      }

      const user = await User.findOne({
        pastkaya918GameName: selectedGameId,
      }).lean();

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found. Please try again or contact customer service for assistance.",
            zh: "用户未找到，请重试或联系客服以获取帮助。",
            zh_hk: "用戶未找到，請重試或聯絡客服以獲取幫助。",
            ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const indexToRemove = user.pastKaya918GameName.indexOf(selectedGameId);

      let newPastGameIDs = [...user.pastKaya918GameName];
      let newPastGamePWs = [...user.pastKaya918GamePW];

      if (indexToRemove > -1) {
        newPastGameIDs.splice(indexToRemove, 1);
        newPastGamePWs.splice(indexToRemove, 1);
      }

      if (user.kaya918GameName && user.kaya918GamePW) {
        newPastGameIDs.push(user.kaya918GameName);
        newPastGamePWs.push(user.kaya918GamePW);
      }

      await User.findByIdAndUpdate(user._id, {
        $set: {
          kaya918GameName: selectedGameId,
          kaya918GamePW: selectedPassword,
          pastKaya918GameName: newPastGameIDs,
          pastKaya918GamePW: newPastGamePWs,
        },
      });

      return res.status(200).json({
        success: true,
        message: {
          en: "918KAYA ID and password set as main successfully.",
          zh: "918KAYA账号和密码已成功设置为主账号。",
          zh_hk: "918KAYA帳號和密碼已成功設置為主帳號。",
          ms: "ID dan kata laluan 918KAYA berjaya ditetapkan sebagai utama.",
          id: "ID dan kata sandi 918KAYA berhasil ditetapkan sebagai utama.",
        },
      });
    } catch (error) {
      console.error("Error occurred while setting main 918KAYA ID:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal server error. Please try again later.",
          zh: "内部服务器错误，请稍后再试。",
          zh_hk: "內部伺服器錯誤，請稍後再試。",
          ms: "Ralat pelayan dalaman. Sila cuba lagi nanti.",
          id: "Kesalahan server internal. Silakan coba lagi nanti.",
        },
      });
    }
  }
);

router.get(
  "/admin/api/kaya918/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await slotKaya918Modal.find({
        username: user.username,
        betTime: {
          $gte: startDate,
          $lt: endDate,
        },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "918KAYA",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("918KAYA: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KAYA: Failed to fetch win/loss report",
          zh: "918KAYA: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/kaya918/kioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await GameDataLog.find({
        date: {
          $gte: moment(new Date(startDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
          $lte: moment(new Date(endDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
        },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        if (
          gameCategories &&
          gameCategories["Slot Games"] &&
          gameCategories["Slot Games"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Slot Games"]);

          if (liveCasino["918KAYA"]) {
            totalTurnover += Number(liveCasino["918KAYA"].turnover || 0);
            totalWinLoss += Number(liveCasino["918KAYA"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "918KAYA",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("918KAYA: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KAYA: Failed to fetch win/loss report",
          zh: "918KAYA: 获取盈亏报告失败",
        },
      });
    }
  }
);

const getKaya918LastSyncTime = async () => {
  const syncLog = await GameSyncLog.findOne({ provider: "kaya918" })
    .sort({ syncTime: -1 })
    .lean();
  return syncLog?.syncTime || null;
};

// Update or create sync time for kaya918
const updateKaya918LastSyncTime = async (time) => {
  await GameSyncLog.findOneAndUpdate(
    { provider: "kaya918" },
    { syncTime: time },
    { upsert: true, new: true }
  );
};

// Fetch bet list from 918 Kaya API
const kaya918GetBetList = async (startTime, endTime) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const requestBody = {
      agentID: kaya918AgentID,
      startUpdateTime: startTime.toString(),
      endUpdateTime: endTime.toString(),
      timeStamp: timestamp,
    };

    const bodyJson = JSON.stringify(requestBody);

    // Ensure AES key is a Buffer of 16 bytes
    const aesKeyBuffer = Buffer.from(kaya918AESKey, "utf8");

    const cipher = crypto.createCipheriv("aes-128-ecb", aesKeyBuffer, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(bodyJson, "utf8", "base64");
    encrypted += cipher.final("base64");

    const aesEncode = crypto
      .createHash("md5")
      .update(encrypted + kaya918MD5Key)
      .digest("hex")
      .toLowerCase();

    console.log("918KAYA Request Body:", requestBody);
    console.log("918KAYA AES-ENCODE:", aesEncode);

    const response = await axios.post(
      `${kaya918APIURL}v1/betlist`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          "AES-ENCODE": aesEncode,
          "Accept-Encoding": "gzip",
        },
      }
    );

    if (response.data.rtStatus !== 1) {
      return {
        success: false,
        error: response.data,
      };
    }

    return {
      success: true,
      data: response.data.data || [],
      dataCount: response.data.dataCount || 0,
    };
  } catch (error) {
    console.error("918KAYA error getting bet list:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

const findUsernameByKaya918Account = async (account) => {
  const user = await User.findOne(
    {
      $or: [
        { kaya918GameName: account },
        { pastKaya918GameName: { $in: [account] } },
      ],
    },
    { username: 1 }
  ).lean();

  return user?.username || null;
};

const syncKaya918GameHistory = async () => {
  try {
    console.log(
      `[918KAYA Sync] Starting sync at ${moment().format(
        "YYYY-MM-DD HH:mm:ss"
      )}`
    );

    // Get last sync time
    const lastSyncTime = await getKaya918LastSyncTime();

    let startUpdateTime;
    let endUpdateTime = moment.utc().subtract(10, "seconds").valueOf(); // 10 seconds ago (in ms)

    if (lastSyncTime) {
      // Continue from last sync time
      startUpdateTime = moment(lastSyncTime).valueOf();
    } else {
      // First run: sync last 5 minutes (max allowed)
      startUpdateTime = moment.utc().subtract(5, "minutes").valueOf();
    }

    // Ensure we don't exceed 5 minute max range
    const maxRange = 5 * 60 * 1000; // 5 minutes in ms
    if (endUpdateTime - startUpdateTime > maxRange) {
      startUpdateTime = endUpdateTime - maxRange;
    }

    console.log(
      `[918KAYA Sync] Fetching from ${moment(startUpdateTime).format(
        "YYYY-MM-DD HH:mm:ss"
      )} to ${moment(endUpdateTime).format("YYYY-MM-DD HH:mm:ss")}`
    );

    // Fetch bet list from API
    const betListResult = await kaya918GetBetList(
      startUpdateTime,
      endUpdateTime
    );

    if (!betListResult.success) {
      console.error(
        "[918KAYA Sync] Failed to fetch bet list:",
        betListResult.error
      );
      return {
        success: false,
        error: betListResult.error,
      };
    }

    const bets = betListResult.data;
    console.log(`[918KAYA Sync] Fetched ${bets.length} bets from API`);

    if (bets.length === 0) {
      // Update sync time even if no bets
      await updateKaya918LastSyncTime(moment(endUpdateTime).toDate());
      return {
        success: true,
        totalBets: 0,
        inserted: 0,
        skipped: 0,
      };
    }

    // Get existing betIds to check for duplicates
    const betIds = bets.map((bet) => bet.betId);
    const existingBetIds = new Set(
      (
        await slotKaya918Modal
          .find({ betId: { $in: betIds } })
          .select("betId")
          .lean()
      ).map((r) => r.betId)
    );

    // Process bets
    const newRecords = [];
    for (const bet of bets) {
      // Skip if already exists
      if (existingBetIds.has(bet.betId)) {
        continue;
      }

      // Find username by account
      const username = await findUsernameByKaya918Account(bet.account);
      if (!username) {
        console.log(
          `[918KAYA Sync] User not found for account: ${bet.account}`
        );
        continue;
      }

      // Convert betTime from Unix timestamp (ms) to Date
      const betTime = bet.betTime
        ? moment.tz(parseInt(bet.betTime), "Asia/Kuala_Lumpur").utc().toDate()
        : moment.utc().toDate();

      newRecords.push({
        gameName: bet.gid || "918KAYA",
        betId: bet.betId,
        username: username,
        betamount: (bet.betAmount || 0) / 10000,
        settleamount: (bet.payOut || 0) / 10000,
        bet: true,
        settle: true,
        betTime: betTime,
      });
    }

    console.log(
      `[918KAYA Sync] New records: ${newRecords.length}, Skipped: ${
        bets.length - newRecords.length
      }`
    );

    // Batch insert new records
    if (newRecords.length > 0) {
      await slotKaya918Modal.insertMany(newRecords, { ordered: false });
      console.log(`[918KAYA Sync] Inserted ${newRecords.length} records`);
    }

    // Update last sync time
    await updateKaya918LastSyncTime(moment(endUpdateTime).toDate());

    return {
      success: true,
      totalBets: bets.length,
      inserted: newRecords.length,
      skipped: bets.length - newRecords.length,
      syncTime: moment(endUpdateTime).format("YYYY-MM-DD HH:mm:ss"),
    };
  } catch (error) {
    console.error("[918KAYA Sync] Fatal error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};
// const kaya918GetBetDetail = async () => {
//   try {
//     const timestamp = Math.floor(Date.now() / 1000);

//     const requestBody = {
//       agentID: kaya918AgentID,
//       betId: "2499531817019",
//       timeStamp: timestamp,
//     };

//     const bodyJson = JSON.stringify(requestBody);

//     // Ensure AES key is a Buffer of 16 bytes
//     const aesKeyBuffer = Buffer.from(kaya918AESKey, "utf8");

//     const cipher = crypto.createCipheriv("aes-128-ecb", aesKeyBuffer, null);
//     cipher.setAutoPadding(true);
//     let encrypted = cipher.update(bodyJson, "utf8", "base64");
//     encrypted += cipher.final("base64");

//     const aesEncode = crypto
//       .createHash("md5")
//       .update(encrypted + kaya918MD5Key)
//       .digest("hex")
//       .toLowerCase();

//     console.log("918KAYA Request Body:", requestBody);
//     console.log("918KAYA AES-ENCODE:", aesEncode);

//     const response = await axios.post(
//       `${kaya918APIURL}v1/betdetail`,
//       requestBody,
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "AES-ENCODE": aesEncode,
//           "Accept-Encoding": "gzip",
//         },
//       }
//     );
//     console.log(response.data);
//     if (response.data.rtStatus !== 1) {
//       return {
//         success: false,
//         error: response.data,
//       };
//     }

//     return {
//       success: true,
//       data: response.data.data || [],
//       dataCount: response.data.dataCount || 0,
//     };
//   } catch (error) {
//     console.error("918KAYA error getting bet list:", error.message);
//     return {
//       success: false,
//       error: error.message,
//     };
//   }
// };

module.exports = router;
module.exports.kaya918CheckBalance = kaya918CheckBalance;
module.exports.syncKaya918GameHistory = syncKaya918GameHistory;
