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
const slotMega888Modal = require("../../models/slot_mega888.model");
const GameSyncLog = require("../../models/game_syncdata.model");
const { syncKaya918GameHistory } = require("../../models/slot_918kaya.model");
const cron = require("node-cron");

require("dotenv").config();

//Staging
const mega888Secret = process.env.MEGA888_SECRET;
const mega888AgentId = "Mega1-6298";
const mega888SN = "ld00";
const mega888APIURL = "https://mgapi-ali.yidaiyiluclub.com/mega-cloud/api/";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRandomPassword() {
  return `Qwer1122`;
}

function generateMD5Hash(data) {
  return crypto.createHash("md5").update(data).digest("hex");
}

function buildParams(postData, method) {
  return {
    jsonrpc: "2.0",
    method: method,
    params: postData,
    id: uuidv4(),
  };
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

const mega888CheckBalance = async (user) => {
  try {
    const random = String(Date.now());
    const digest = generateMD5Hash(
      random + mega888SN + user.mega888GameName + mega888Secret
    );

    const payload = buildParams(
      {
        loginId: user.mega888GameName,
        sn: mega888SN,
        random: random,
        digest: digest,
      },
      "open.mega.balance.get"
    );
    const response = await axios.post(mega888APIURL, payload);

    if (response.data.error) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("MEGA888 error checking user balance", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

async function mega888Deposit(user, trfamount) {
  try {
    const random = String(Date.now());
    const digest = generateMD5Hash(
      random + mega888SN + user.mega888GameName + trfamount + mega888Secret
    );

    const payload = buildParams(
      {
        loginId: user.mega888GameName,
        sn: mega888SN,
        random: random,
        digest: digest,
        amount: trfamount,
      },
      "open.mega.balance.transfer"
    );

    const response = await axios.post(mega888APIURL, payload);

    if (response.data.error) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("MEGA888 error in deposit:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function mega888Withdraw(user, trfamount) {
  try {
    const random = String(Date.now());
    const digest = generateMD5Hash(
      random + mega888SN + user.mega888GameName + -trfamount + mega888Secret
    );

    const payload = buildParams(
      {
        loginId: user.mega888GameName,
        sn: mega888SN,
        random: random,
        digest: digest,
        amount: -trfamount,
      },
      "open.mega.balance.transfer"
    );

    const response = await axios.post(mega888APIURL, payload);
    if (response.data.error) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("MEGA888 error in withdraw:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

const mega888RegisterUser = async (user) => {
  try {
    const randomPass = generateRandomPassword();
    const random = String(Date.now());
    const digest = generateMD5Hash(random + mega888SN + mega888Secret);

    const payload = buildParams(
      {
        nickname: user.username,
        sn: mega888SN,
        agentLoginId: mega888AgentId,
        random: random,
        digest: digest,
      },
      "open.mega.user.create"
    );

    const response = await axios.post(mega888APIURL, payload);

    if (response.data && response.data.result && response.data.result.success) {
      const generatedLoginId = response.data.result.loginId;

      const updateFields = {
        $set: {
          mega888GameName: generatedLoginId,
          mega888GamePW: randomPass,
        },
      };

      if (user.mega888GameName && user.mega888GamePW) {
        updateFields.$push = {
          pastMega888GameName: user.mega888GameName,
          pastMega888GamePW: user.mega888GamePW,
        };
      }

      await User.findByIdAndUpdate(user._id, updateFields, { new: true });

      return {
        success: true,
        userData: {
          userId: generatedLoginId,
          password: randomPass,
        },
      };
    } else {
      console.log(response.data, "MEGA888 Registration Failed");
      return {
        success: false,
        error: response.data,
      };
    }
  } catch (error) {
    console.log("MEGA888 error in registering user", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

router.post(
  "/admin/api/mega888/manualregister/:userId",
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

      const registerResponse = await mega888RegisterUser(user);

      if (!registerResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "MEGA888: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "MEGA888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "MEGA888: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "MEGA888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "MEGA888: Account registered successfully.",
          zh: "MEGA888: 账户注册成功。",
          ms: "MEGA888: Akaun berjaya didaftarkan.",
          zh_hk: "MEGA888: 帳戶註冊成功。",
          id: "MEGA888: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: registerResponse.userData.userId,
          password: registerResponse.userData.password,
        },
      });
    } catch (error) {
      console.log("MEGA888 error in registering user", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Registration failed. Please try again or contact customer support for assistance.",
          zh: "MEGA888: 注册失败。请重试或联系客服寻求帮助。",
          ms: "MEGA888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "MEGA888: 註冊失敗。請重試或聯絡客服尋求協助。",
          id: "MEGA888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/mega888/register/:userId",
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

      const registerResponse = await mega888RegisterUser(user);

      if (!registerResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "MEGA888: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "MEGA888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "MEGA888: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "MEGA888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "MEGA888: Account registered successfully.",
          zh: "MEGA888: 账户注册成功。",
          ms: "MEGA888: Akaun berjaya didaftarkan.",
          zh_hk: "MEGA888: 帳戶註冊成功。",
          id: "MEGA888: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: registerResponse.userData.userId,
          password: registerResponse.userData.password,
        },
      });
    } catch (error) {
      console.log("MEGA888 error in registering user", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Registration failed. Please try again or contact customer support for assistance.",
          zh: "MEGA888: 注册失败。请重试或联系客服寻求帮助。",
          ms: "MEGA888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "MEGA888: 註冊失敗。請重試或聯絡客服尋求協助。",
          id: "MEGA888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/mega888/getbalance/:userId",
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

      const balanceResponse = await mega888CheckBalance(user);

      if (!balanceResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Unable to retrieve player balance. Please try again or contact customer support for assistance.",
            zh: "MEGA888: 无法获取玩家余额。请重试或联系客服寻求帮助。",
            ms: "MEGA888: Tidak dapat mendapatkan baki pemain. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
            zh_hk: "MEGA888: 無法獲取玩家餘額。請重試或聯絡客服尋求協助。",
            id: "MEGA888: Tidak dapat mengambil saldo pemain. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        balance: balanceResponse.data.result || 0,
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
          zh_hk: "餘額查詢成功。",
          id: "Saldo berhasil diambil.",
        },
      });
    } catch (error) {
      console.error("MEGA888 error checking user balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Unable to retrieve player balance. Please try again or contact customer support for assistance.",
          zh: "MEGA888: 无法获取玩家余额。请重试或联系客服寻求帮助。",
          ms: "MEGA888: Tidak dapat mendapatkan baki pemain. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "MEGA888: 無法獲取玩家餘額。請重試或聯絡客服尋求協助。",
          id: "MEGA888: Tidak dapat mengambil saldo pemain. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/mega888/deposit/:userId",
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

      if (!user.mega888GameName) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Game account not registered. Please register an account first to proceed.",
            zh: "MEGA888: 游戏账户未注册。请先注册账户以继续。",
            ms: "MEGA888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "MEGA888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "MEGA888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      if (user.gameStatus.mega888.transferInStatus) {
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

      const depositResponse = await mega888Deposit(
        user,
        formattedDepositAmount
      );

      if (!depositResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Deposit failed. Please try again or contact customer support for further assistance.",
            zh: "MEGA888: 存款失败。请重试或联系客服寻求进一步帮助。",
            ms: "MEGA888: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "MEGA888: 存款失敗。請重試或聯絡客服尋求進一步協助。",
            id: "MEGA888: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      try {
        const gameBalance = await mega888CheckBalance(user);

        await GameWalletLogAttempt(
          user.username,
          "Transfer In",
          remark || "Transfer",
          roundToTwoDecimals(formattedDepositAmount),
          "MEGA888",
          roundToTwoDecimals(gameBalance.data.result || 0),
          0,
          0
        );
      } catch (logError) {
        console.error("MEGA888: Failed to log transaction:", logError.message);
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "MEGA888: Deposit completed successfully.",
          zh: "MEGA888: 存款成功完成。",
          ms: "MEGA888: Deposit berjaya diselesaikan.",
          zh_hk: "MEGA888: 存款成功完成。",
          id: "MEGA888: Deposit berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("MEGA888 error in deposit", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Deposit failed. Please try again or contact customer support for further assistance.",
          zh: "MEGA888: 存款失败。请重试或联系客服寻求进一步帮助。",
          ms: "MEGA888: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "MEGA888: 存款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "MEGA888: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/mega888/withdraw/:userId",
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

      if (!user.mega888GameName) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Game account not registered. Please register an account first to proceed.",
            zh: "MEGA888: 游戏账户未注册。请先注册账户以继续。",
            ms: "MEGA888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "MEGA888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "MEGA888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      if (user.gameStatus.mega888.transferOutStatus) {
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

      const withdrawResponse = await mega888Withdraw(
        user,
        formattedWithdrawAmount
      );

      if (!withdrawResponse.success) {
        console.error("MEGA888: Withdraw failed -", withdrawResponse.error);

        if (withdrawResponse.error.error.code === "37123") {
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
            en: "MEGA888: Withdrawal failed. Please try again or contact customer support for further assistance.",
            zh: "MEGA888: 提款失败。请重试或联系客服寻求进一步帮助。",
            ms: "MEGA888: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "MEGA888: 提款失敗。請重試或聯絡客服尋求進一步協助。",
            id: "MEGA888: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      try {
        const gameBalance = await mega888CheckBalance(user);

        await GameWalletLogAttempt(
          user.username,
          "Transfer Out",
          remark || "Transfer",
          roundToTwoDecimals(formattedWithdrawAmount),
          "MEGA888",
          roundToTwoDecimals(gameBalance.data.result || 0),
          0,
          0
        );
      } catch (logError) {
        console.error("MEGA888: Failed to log transaction:", logError.message);
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "MEGA888: Withdrawal completed successfully.",
          zh: "MEGA888: 提款成功完成。",
          ms: "MEGA888: Pengeluaran berjaya diselesaikan.",
          zh_hk: "MEGA888: 提款成功完成。",
          id: "MEGA888: Penarikan berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("MEGA888 error in transferout", error.message);

      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Withdrawal failed. Please try again or contact customer support for further assistance.",
          zh: "MEGA888: 提款失败。请重试或联系客服寻求进一步帮助。",
          ms: "MEGA888: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "MEGA888: 提款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "MEGA888: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/mega888/updatepassword/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;

      const { newpassword } = req.body;

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

      const user = await User.findOneAndUpdate(
        { _id: userId },
        { $set: { mega888GamePW: newpassword } },
        { new: true }
      );

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

      return res.status(200).json({
        success: true,
        message: {
          en: "MEGA888: Password updated successfully.",
          zh: "MEGA888: 密码更新成功。",
          ms: "MEGA888: Kata laluan berjaya dikemas kini.",
          zh_hk: "MEGA888: 密碼更新成功。",
          id: "MEGA888: Kata sandi berhasil diperbarui.",
        },
      });
    } catch (error) {
      console.log("MEGA888 error updating password:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Failed to update password due to a technical issue. Please try again or contact customer support for assistance.",
          zh: "MEGA888: 由于技术问题更新密码失败。请重试或联系客服寻求帮助。",
          ms: "MEGA888: Gagal mengemas kini kata laluan kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk:
            "MEGA888: 由於技術問題更新密碼失敗。請重試或聯絡客服尋求協助。",
          id: "MEGA888: Gagal memperbarui kata sandi karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.get(
  "/admin/api/mega888/setstatus/:playerId",
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

      const random = String(Date.now());
      const digest = generateMD5Hash(
        random + mega888SN + currentPlayer.mega888GameName + mega888Secret
      );

      const method =
        status === true ? "open.mega.user.enable" : "open.mega.user.disable";

      const payload = buildParams(
        {
          sn: mega888SN,
          digest: digest,
          random: random,
          loginId: currentPlayer.mega888GameName,
        },
        method
      );

      const response = await axios.post(mega888APIURL, payload);

      if (response.data.result !== 1) {
        console.log("failed to update status", response.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Failed to update player status. Please try again or contact customer support.",
            zh: "MEGA888: 更新玩家状态失败。请重试或联系客服。",
            ms: "MEGA888: Gagal mengemas kini status pemain. Sila cuba lagi atau hubungi sokongan pelanggan.",
            zh_hk: "MEGA888: 更新玩家狀態失敗。請重試或聯絡客服。",
            id: "MEGA888: Gagal memperbarui status pemain. Silakan coba lagi atau hubungi dukungan pelanggan.",
          },
        });
      }

      await User.findByIdAndUpdate(playerId, {
        "gameSuspendStatus.mega888.lock": status !== true,
      });

      const statusText = status === true ? "Enabled" : "Disabled";

      return res.status(200).json({
        success: true,
        message: {
          en: `MEGA888: Player status successfully updated to ${statusText}.`,
          zh: `MEGA888: 玩家状态已成功更新为${
            status === true ? "启用" : "禁用"
          }。`,
          ms: `MEGA888: Status pemain berjaya dikemas kini kepada ${
            status === true ? "Diaktifkan" : "Dilumpuhkan"
          }.`,
          zh_hk: `MEGA888: 玩家狀態已成功更新為${
            status === true ? "啟用" : "禁用"
          }。`,
          id: `MEGA888: Status pemain berhasil diperbarui menjadi ${
            status === true ? "Diaktifkan" : "Dinonaktifkan"
          }.`,
        },
      });
    } catch (error) {
      console.log("MEGA888: Failed to update player status:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "MEGA888: Failed to update player status due to a technical issue. Please try again or contact customer support.",
          zh: "MEGA888: 由于技术问题更新玩家状态失败。请重试或联系客服。",
          ms: "MEGA888: Gagal mengemas kini status pemain kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan.",
          zh_hk: "MEGA888: 由於技術問題更新玩家狀態失敗。請重試或聯絡客服。",
          id: "MEGA888: Gagal memperbarui status pemain karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/mega888/setAsMain",
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
        pastMega888GameName: selectedGameId,
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

      const indexToRemove = user.pastMega888GameName.indexOf(selectedGameId);

      let newPastGameIDs = [...user.pastMega888GameName];
      let newPastGamePWs = [...user.pastMega888GamePW];

      if (indexToRemove > -1) {
        newPastGameIDs.splice(indexToRemove, 1);
        newPastGamePWs.splice(indexToRemove, 1);
      }

      if (user.mega888GameName && user.mega888GamePW) {
        newPastGameIDs.push(user.mega888GameName);
        newPastGamePWs.push(user.mega888GamePW);
      }

      await User.findByIdAndUpdate(user._id, {
        $set: {
          mega888GameName: selectedGameId,
          mega888GamePW: selectedPassword,
          pastMega888GameName: newPastGameIDs,
          pastMega888GamePW: newPastGamePWs,
        },
      });

      return res.status(200).json({
        success: true,
        message: {
          en: "MEGA888 ID and password set as main successfully.",
          zh: "MEGA888账号和密码已成功设置为主账号。",
          zh_hk: "MEGA888帳號和密碼已成功設置為主帳號。",
          ms: "ID dan kata laluan MEGA888 berjaya ditetapkan sebagai utama.",
          id: "ID dan kata sandi MEGA888 berhasil ditetapkan sebagai utama.",
        },
      });
    } catch (error) {
      console.error("Error occurred while setting main MEGA888 ID:", error);
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
  "/admin/api/mega888/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await slotMega888Modal.find({
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
          gamename: "MEGA888",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("MEGA888: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "MEGA888: Failed to fetch win/loss report",
          zh: "MEGA888: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/mega888/kioskreport",
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

          if (liveCasino["MEGA888"]) {
            totalTurnover += Number(liveCasino["MEGA888"].turnover || 0);
            totalWinLoss += Number(liveCasino["MEGA888"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MEGA888",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("MEGA888: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "MEGA888: Failed to fetch win/loss report",
          zh: "MEGA888: 获取盈亏报告失败",
        },
      });
    }
  }
);

const getLastSyncTime = async () => {
  const syncLog = await GameSyncLog.findOne({ provider: "mega888" })
    .sort({ syncTime: -1 })
    .lean();
  return syncLog?.syncTime || null;
};

const updateLastSyncTime = async (time) => {
  await GameSyncLog.create({
    provider: "mega888",
    syncTime: time.toDate(),
  });
};

// Fetch total report from Mega888 API
const fetchMega888TotalReport = async (start, end) => {
  const random = String(Date.now());
  const digest = generateMD5Hash(
    random + mega888SN + mega888AgentId + mega888Secret
  );

  const payload = buildParams(
    {
      sn: mega888SN,
      random: random,
      agentLoginId: mega888AgentId,
      digest: digest,
      type: 1,
      startTime: start,
      endTime: end,
    },
    "open.mega.player.total.report"
  );

  // console.log(`[Mega888 API] Fetching total report: ${start} to ${end}`);

  const response = await axios.post(mega888APIURL, payload);

  if (response.data.error) {
    throw new Error(response.data.error.message);
  }

  const results = response.data.result || [];
  // console.log(`[Mega888 API] Total report returned ${results.length} entries`);

  const playerTotals = {};

  // Convert loginId to username and aggregate
  for (const entry of results) {
    const { loginId, bet, win } = entry;

    const user = await User.findOne(
      { mega888GameName: loginId },
      { username: 1 }
    ).lean();

    if (user) {
      const username = user.username;

      if (!playerTotals[username]) {
        playerTotals[username] = {
          turnover: 0,
          winloss: 0,
        };
      }

      playerTotals[username].turnover += parseFloat(bet || 0);
      playerTotals[username].winloss += parseFloat(win || 0);
    }
  }

  // Round to 2 decimal places
  Object.keys(playerTotals).forEach((username) => {
    playerTotals[username].turnover = Number(
      playerTotals[username].turnover.toFixed(2)
    );
    playerTotals[username].winloss = Number(
      playerTotals[username].winloss.toFixed(2)
    );
  });

  return playerTotals;
};

// Get totals from database for specific period
const getDbTotalsForPeriod = async (start, end) => {
  const startDate = moment(start, "YYYY-MM-DD HH:mm:ss").toDate();
  const endDate = moment(end, "YYYY-MM-DD HH:mm:ss").toDate();

  // console.log(`[Mega888 DB] Querying totals from ${start} to ${end}`);

  const aggregation = await slotMega888Modal.aggregate([
    {
      $match: {
        betTime: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: "$username",
        turnover: { $sum: "$betamount" },
        winloss: { $sum: "$settleamount" },
      },
    },
  ]);

  const dbTotals = {};
  aggregation.forEach((item) => {
    dbTotals[item._id] = {
      turnover: Number(item.turnover.toFixed(2)),
      winloss: Number(item.winloss.toFixed(2)),
    };
  });

  // console.log(
  //   `[Mega888 DB] Found ${Object.keys(dbTotals).length} players in database`
  // );

  return dbTotals;
};

// Fetch detailed game history for specific user and time range (SAME DAY ONLY)
const fetchAndStoreDetailedGameHistory = async (username, start, end) => {
  try {
    // console.log(`[Mega888 Detail] Fetching ${username}: ${start} to ${end}`);

    const user = await User.findOne(
      { username },
      { mega888GameName: 1 }
    ).lean();
    if (!user || !user.mega888GameName) {
      throw new Error("User not found or no Mega888 account");
    }

    const loginId = user.mega888GameName;

    // Fetch all pages for this time range
    const fetchPage = async (pageIndex) => {
      // Add delay for rate limiting (except first page)
      if (pageIndex > 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const random = String(Date.now() + pageIndex);
      const digest = generateMD5Hash(
        random + mega888SN + loginId + mega888Secret
      );

      const payload = buildParams(
        {
          sn: mega888SN,
          random: random,
          loginId: loginId,
          digest: digest,
          startTime: start,
          endTime: end,
          pageIndex: pageIndex,
          pageSize: 100,
        },
        "open.mega.game.order.page"
      );

      const response = await axios.post(mega888APIURL, payload);
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      return response.data.result;
    };

    // Fetch first page
    const firstPage = await fetchPage(1);

    if (!firstPage?.items?.length) {
      // console.log(`[Mega888 Detail] No records for ${username}`);
      return { totalRecords: 0, newRecords: 0, skipped: 0 };
    }

    let allItems = [...firstPage.items];

    // Fetch remaining pages if exists
    if (firstPage.hasNextPage && firstPage.totalPage > 1) {
      const totalPages = Math.min(firstPage.totalPage, 50); // Safety limit

      // console.log(`[Mega888 Detail] ${username}: ${totalPages} pages total`);

      for (let page = 2; page <= totalPages; page++) {
        const pageResult = await fetchPage(page);
        if (pageResult?.items?.length) {
          allItems = allItems.concat(pageResult.items);
          // console.log(
          //   `[Mega888 Detail] ${username}: Page ${page}/${totalPages} - ${pageResult.items.length} items`
          // );
        }
      }
    }

    // console.log(
    //   `[Mega888 Detail] ${username}: Fetched ${allItems.length} total items`
    // );

    // Check for existing records to prevent duplicates
    const betIds = allItems.map((item) => String(item.id));
    const existingBetIds = new Set(
      (
        await slotMega888Modal
          .find({ betId: { $in: betIds } })
          .select("betId")
          .lean()
      ).map((r) => r.betId)
    );

    // Filter out existing records
    const startDateObj = moment(start, "YYYY-MM-DD HH:mm:ss").toDate();
    const endDateObj = moment(end, "YYYY-MM-DD HH:mm:ss").toDate();
    const newRecords = allItems
      .filter((item) => !existingBetIds.has(String(item.id)))
      .map((item) => ({
        betId: String(item.id),
        username: username,
        gameName: item.gameName || "MEGA888",
        beganbalance: parseFloat(item.beginBalance || 0),
        endbalance: parseFloat(item.endBalance || 0),
        betamount: parseFloat(item.bet || 0),
        settleamount: parseFloat(item.win || 0),
        bet: true,
        settle: true,
        startDate: startDateObj,
        endDate: endDateObj,
        claimed: false,
        betTime: item.createTime
          ? moment
              .tz(item.createTime, "YYYY-MM-DD HH:mm:ss", "Asia/Kuala_Lumpur")
              .utc()
              .toDate()
          : moment.utc().toDate(),
      }));

    // console.log(
    //   `[Mega888 Detail] ${username}: New=${newRecords.length}, Skipped=${
    //     allItems.length - newRecords.length
    //   }`
    // );

    // Batch insert new records
    if (newRecords.length > 0) {
      await slotMega888Modal.insertMany(newRecords, {
        ordered: false,
      });
      // console.log(
      //   `[Mega888 Detail] ${username}: Inserted ${newRecords.length} records`
      // );
    }

    return {
      totalRecords: allItems.length,
      newRecords: newRecords.length,
      skipped: allItems.length - newRecords.length,
    };
  } catch (error) {
    console.error(`[Mega888 Detail] Error for ${username}:`, error.message);
    throw error;
  }
};

const syncMega888ForSingleDay = async (date) => {
  try {
    // Create start and end for the entire day
    const start = moment(date)
      .utc()
      .add(8, "hours")
      .startOf("day")
      .format("YYYY-MM-DD HH:mm:ss");
    const end = moment(date)
      .utc()
      .add(8, "hours")
      .endOf("day")
      .format("YYYY-MM-DD HH:mm:ss");

    // console.log(`[Mega888 Sync Day] Syncing ${date}: ${start} to ${end}`);

    // Step 1: Get total report from Mega888 API for this day
    const apiTotals = await fetchMega888TotalReport(start, end);

    if (!apiTotals || Object.keys(apiTotals).length === 0) {
      // console.log(`[Mega888 Sync Day] No data from API for ${date}`);
      return {
        date: date,
        totalPlayers: 0,
        successful: 0,
        failed: 0,
        playerDetails: [],
      };
    }

    // console.log(
    //   `[Mega888 Sync Day] API returned ${
    //     Object.keys(apiTotals).length
    //   } players for ${date}`
    // );

    // Step 2: Get totals from our database for the same day
    const dbTotals = await getDbTotalsForPeriod(start, end);

    // Step 3: Compare and identify players with discrepancies
    const playersToSync = [];
    for (const [username, apiData] of Object.entries(apiTotals)) {
      const dbData = dbTotals[username] || { turnover: 0, winloss: 0 };

      // Allow 0.01 difference for floating point precision
      const turnoverDiff = Math.abs(apiData.turnover - dbData.turnover);

      if (turnoverDiff > 0.01) {
        playersToSync.push({
          username,
          apiTurnover: apiData.turnover,
          dbTurnover: dbData.turnover,
          difference: turnoverDiff,
        });
        // console.log(
        //   `[Mega888 Sync Day] ${date} - Discrepancy for ${username}: API=${
        //     apiData.turnover
        //   }, DB=${dbData.turnover}, Diff=${turnoverDiff.toFixed(2)}`
        // );
      }
    }

    // console.log(
    //   `[Mega888 Sync Day] ${date} - Found ${playersToSync.length} players with discrepancies`
    // );

    // Step 4: Fetch detailed game history for players with discrepancies
    let syncResults = {
      date: date,
      totalPlayers: playersToSync.length,
      successful: 0,
      failed: 0,
      playerDetails: [],
    };

    // Process players sequentially with rate limiting
    for (const player of playersToSync) {
      try {
        // console.log(`[Mega888 Sync Day] ${date} - Syncing ${player.username}`);

        const result = await fetchAndStoreDetailedGameHistory(
          player.username,
          start,
          end
        );

        syncResults.successful++;
        syncResults.playerDetails.push({
          username: player.username,
          status: "success",
          ...result,
        });

        // Rate limiting: 500ms delay between players
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(
          `[Mega888 Sync Day] ${date} - Failed ${player.username}:`,
          error.message
        );
        syncResults.failed++;
        syncResults.playerDetails.push({
          username: player.username,
          status: "failed",
          error: error.message,
        });
      }
    }

    // console.log(
    //   `[Mega888 Sync Day] ${date} - Completed: ${syncResults.successful} successful, ${syncResults.failed} failed`
    // );

    return syncResults;
  } catch (error) {
    console.error(`[Mega888 Sync Day] Error for ${date}:`, error.message);
    throw error;
  }
};

const syncMega888GameHistory = async () => {
  try {
    // console.log(
    //   `[Mega888 Sync] Starting sync at ${moment().format(
    //     "YYYY-MM-DD HH:mm:ss"
    //   )}`
    // );

    const now = moment().utc().add(8, "hours");

    const daysToSync = [];

    // Get last sync time
    const lastSyncTime = await getLastSyncTime();

    if (!lastSyncTime) {
      // First run: sync last 7 days
      for (let i = 0; i < 7; i++) {
        const date = now.clone().subtract(i, "days").format("YYYY-MM-DD");
        daysToSync.push(date);
      }
    } else {
      const lastSyncMoment = moment(lastSyncTime).utc().add(8, "hours");
      const daysSinceLastSync = now.diff(lastSyncMoment, "days");

      // Sync today + any missed days (max 7 days back)
      const daysBack = Math.min(daysSinceLastSync + 1, 7);
      for (let i = 0; i < daysBack; i++) {
        const date = now.clone().subtract(i, "days").format("YYYY-MM-DD");
        daysToSync.push(date);
      }
    }

    // console.log(`[Mega888 Sync] Days to sync: ${daysToSync.join(", ")}`);

    let totalSyncResults = {
      totalDays: daysToSync.length,
      daysProcessed: 0,
      totalPlayers: 0,
      successful: 0,
      failed: 0,
      details: [],
    };

    for (const date of daysToSync) {
      try {
        // console.log(`\n[Mega888 Sync] ======== Processing ${date} ========`);

        const dayResult = await syncMega888ForSingleDay(date);

        totalSyncResults.daysProcessed++;
        totalSyncResults.totalPlayers += dayResult.totalPlayers;
        totalSyncResults.successful += dayResult.successful;
        totalSyncResults.failed += dayResult.failed;
        totalSyncResults.details.push({
          date: date,
          ...dayResult,
        });

        if (daysToSync.indexOf(date) < daysToSync.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`[Mega888 Sync] Failed to sync ${date}:`, error.message);
        totalSyncResults.details.push({
          date: date,
          status: "failed",
          error: error.message,
        });
      }
    }

    await updateLastSyncTime(now);

    // console.log(`\n[Mega888 Sync] ======== SUMMARY ========`);
    // console.log(
    //   `Days processed: ${totalSyncResults.daysProcessed}/${totalSyncResults.totalDays}`
    // );
    // console.log(
    //   `Players synced: ${totalSyncResults.successful} successful, ${totalSyncResults.failed} failed`
    // );

    return {
      success: true,
      syncTime: now.format("YYYY-MM-DD HH:mm:ss"),
      ...totalSyncResults,
    };
  } catch (error) {
    console.error("[Mega888 Sync] Fatal error:", error.message);
    throw error;
  }
};
if (process.env.NODE_ENV !== "development") {
  cron.schedule("*/4 * * * *", async () => {
    // Mega888 sync
    // console.log("[Cron] Starting Mega888 sync job");
    try {
      await syncMega888GameHistory();
      // console.log("[Cron] Mega888 sync completed successfully");
    } catch (error) {
      console.error("[Cron] Mega888 sync failed:", error.message);
    }

    console.log("[Cron] Starting 918KAYA sync job");
    try {
      const result = await syncKaya918GameHistory();
      console.log("[Cron] 918KAYA sync completed:", result);
    } catch (error) {
      console.error("[Cron] 918KAYA sync failed:", error.message);
    }
  });
}

module.exports = router;
module.exports.mega888CheckBalance = mega888CheckBalance;
