const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const { User, adminUserWalletLog } = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const { v4: uuidv4 } = require("uuid");
const querystring = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const moment = require("moment");
require("dotenv").config();

function generateUniqueTransactionId(prefix) {
  const uuid = uuidv4().replace(/-/g, ""); // Remove hyphens
  return `${prefix}-${uuid.substring(0, 43)}`; // Ensure the length is 50 characters maximum
}

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

const gameAPIURL = "https://w.apiext88.net";
const webURL = "https://www.hkwin88.com/";
const gameAPPID = "FTXS";
const gameKEY = process.env.JOKER_SECRET;
const gamePassword = "Qwer1122";

function generateSignature(fields, secretKey) {
  const data = [];
  for (const key in fields) {
    data.push(`${key}=${fields[key]}`);
  }
  data.sort();

  const rawData = data.join("&");

  const hmac = crypto.createHmac("sha1", Buffer.from(secretKey, "utf8"));
  hmac.update(rawData, "utf8");

  return hmac.digest("base64");
}

function generateUniqueTransactionId(prefix) {
  const uuid = uuidv4().replace(/-/g, "");
  return `${prefix}-${uuid.substring(0, 14)}`;
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

async function JokerCheckBalance(user, rate) {
  try {
    const timestamp = moment().unix();

    const username = rate === "5x" ? `5${user.gameId}` : user.gameId;

    const fields = {
      Method: "GC",
      Username: username,
      Timestamp: timestamp,
    };

    const Signature = generateSignature(fields, gameKEY);

    const response = await axios.post(
      `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
        Signature
      )}`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status !== 200) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("JOKER error in checking balance:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function JokerDeposit(user, trfamount, rate) {
  try {
    const requestID = generateUniqueTransactionId("hkwin88");
    const timestamp = moment().unix();

    const username = rate === "5x" ? `5${user.gameId}` : user.gameId;

    const fields = {
      Method: "TC",
      Username: username,
      Timestamp: timestamp,
      RequestID: requestID,
      Amount: trfamount,
    };

    const Signature = generateSignature(fields, gameKEY);

    const response = await axios.post(
      `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
        Signature
      )}`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status !== 200) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("JOKER error in deposit:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function JokerWithdraw(user, trfamount, rate) {
  try {
    const requestID = generateUniqueTransactionId("hkwin88");
    const timestamp = moment().unix();

    const username = rate === "5x" ? `5${user.gameId}` : user.gameId;

    const fields = {
      Method: "TC",
      Username: username,
      Timestamp: timestamp,
      RequestID: requestID,
      Amount: -trfamount,
    };

    const Signature = generateSignature(fields, gameKEY);

    const response = await axios.post(
      `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
        Signature
      )}`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status !== 200) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("JOKER error in withdraw:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function setJokerPassword(user, rate, password) {
  try {
    const timestamp = moment().unix();

    const username = rate === "5x" ? `5${user.gameId}` : user.gameId;

    const fields = {
      Method: "SP",
      Username: username,
      Password: password,
      Timestamp: timestamp,
    };

    const Signature = generateSignature(fields, gameKEY);

    const response = await axios.post(
      `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
        Signature
      )}`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.Status !== "OK") {
      return {
        success: false,
        error: response.data,
      };
    }

    const updateFields =
      rate === "5x" ? { jokerGameTwoPW: password } : { jokerGamePW: password };

    await User.updateMany({ gameId: user.gameId }, { $set: updateFields });

    return { success: true, data: response.data, password: password };
  } catch (error) {
    console.error("JOKER error in setting password:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
async function registerJokerUser(user, rate) {
  try {
    const timestamp = moment().unix();

    const username = rate === "5x" ? `5${user.gameId}` : user.gameId;

    const fields = {
      Method: "CU",
      Username: username,
      Timestamp: timestamp,
    };

    const Signature = generateSignature(fields, gameKEY);

    const response = await axios.post(
      `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
        Signature
      )}`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.Status !== "Created" && response.data.Status !== "OK") {
      return {
        success: false,
        error: response.data,
      };
    }

    const updateFields =
      rate === "5x"
        ? { jokerGameTwoName: `${gameAPPID}.${username}` }
        : { jokerGameName: `${gameAPPID}.${username}` };

    await User.updateMany({ gameId: user.gameId }, { $set: updateFields });

    const setPasswordResponse = await setJokerPassword(
      user,
      rate,
      gamePassword
    );

    if (!setPasswordResponse.success) {
      console.log("failed to set password for user", setPasswordResponse);
      return {
        success: false,
        error: setPasswordResponse.error,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("JOKER error in creating member:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post(
  "/admin/api/jokerx2/register/:userId",
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

      const registerResponse = await registerJokerUser(user, "2x");
      if (!registerResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "JOKER: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "JOKER: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "JOKER: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "JOKER: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Account registered successfully.",
          zh: "JOKER: 账户注册成功。",
          ms: "JOKER: Akaun berjaya didaftarkan.",
          zh_hk: "JOKER: 帳戶註冊成功。",
          id: "JOKER: Akun berhasil didaftarkan.",
        },
        gameAccount: {
          gameID: `${gameAPPID}.${user.gameId}`,
          gamePW: gamePassword,
        },
      });
    } catch (error) {
      console.log("JOKER error fetching balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Registration failed due to a technical issue. Please try again or contact customer support for assistance.",
          zh: "JOKER: 由于技术问题注册失败。请重试或联系客服寻求帮助。",
          ms: "JOKER: Pendaftaran gagal kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "JOKER: 由於技術問題註冊失敗。請重試或聯絡客服尋求協助。",
          id: "JOKER: Pendaftaran gagal karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/jokerx2/getbalance/:userId",
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
      const balanceResponse = await JokerCheckBalance(user, "2x");
      if (!balanceResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Unable to retrieve player balance. Please try again or contact customer support for assistance.",
            zh: "JOKER: 无法获取玩家余额。请重试或联系客服寻求帮助。",
            ms: "JOKER: Tidak dapat mendapatkan baki pemain. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
            zh_hk: "JOKER: 無法獲取玩家餘額。請重試或聯絡客服尋求協助。",
            id: "JOKER: Tidak dapat mengambil saldo pemain. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        balance: balanceResponse.data.Credit,
        outstanding: balanceResponse.data.OutstandingCredit,
      });
    } catch (error) {
      console.log("JOKER error fetching balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Unable to retrieve player balance. Please try again or contact customer support for assistance.",
          zh: "JOKER: 无法获取玩家余额。请重试或联系客服寻求帮助。",
          ms: "JOKER: Tidak dapat mendapatkan baki pemain. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "JOKER: 無法獲取玩家餘額。請重試或聯絡客服尋求協助。",
          id: "JOKER: Tidak dapat mengambil saldo pemain. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/jokerx2/deposit/:userId",
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

      if (!user.jokerGameName) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Game account not registered. Please register an account first to proceed.",
            zh: "JOKER: 游戏账户未注册。请先注册账户以继续。",
            ms: "JOKER: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "JOKER: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "JOKER: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      if (user.gameStatus.jokerx2.transferInStatus) {
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

      const depositResponse = await JokerDeposit(
        user,
        formattedDepositAmount,
        "2x"
      );

      if (!depositResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Deposit failed. Please try again or contact customer support for further assistance.",
            zh: "JOKER: 存款失败。请重试或联系客服寻求进一步帮助。",
            ms: "JOKER: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "JOKER: 存款失敗。請重試或聯絡客服尋求進一步協助。",
            id: "JOKER: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        remark || "Transfer",
        roundToTwoDecimals(formattedDepositAmount),
        "JOKER X2",
        roundToTwoDecimals(depositResponse.data.Credit || 0),
        0,
        0
      );

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Deposit completed successfully.",
          zh: "JOKER: 存款成功完成。",
          ms: "JOKER: Deposit berjaya diselesaikan.",
          zh_hk: "JOKER: 存款成功完成。",
          id: "JOKER: Deposit berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("JOKER error deposit", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Deposit failed. Please try again or contact customer support for further assistance.",
          zh: "JOKER: 存款失败。请重试或联系客服寻求进一步帮助。",
          ms: "JOKER: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "JOKER: 存款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "JOKER: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/jokerx2/withdraw/:userId",
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

      if (!user.jokerGameName) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Game account not registered. Please register an account first to proceed.",
            zh: "JOKER: 游戏账户未注册。请先注册账户以继续。",
            ms: "JOKER: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "JOKER: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "JOKER: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      if (user.gameStatus.jokerx2.transferOutStatus) {
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

      const withdrawResponse = await JokerWithdraw(
        user,
        formattedWithdrawAmount,
        "2x"
      );

      if (!withdrawResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Withdrawal failed. Please try again or contact customer support for further assistance.",
            zh: "JOKER: 提款失败。请重试或联系客服寻求进一步帮助。",
            ms: "JOKER: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "JOKER: 提款失敗。請重試或聯絡客服尋求進一步協助。",
            id: "JOKER: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer Out",
        remark || "Transfer",
        roundToTwoDecimals(formattedWithdrawAmount),
        "JOKER X2",
        roundToTwoDecimals(withdrawResponse.data.Credit || 0),
        0,
        0
      );

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Withdrawal completed successfully.",
          zh: "JOKER: 提款成功完成。",
          ms: "JOKER: Pengeluaran berjaya diselesaikan.",
          zh_hk: "JOKER: 提款成功完成。",
          id: "JOKER: Penarikan berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("JOKER error deposit", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Withdrawal failed. Please try again or contact customer support for further assistance.",
          zh: "JOKER: 提款失败。请重试或联系客服寻求进一步帮助。",
          ms: "JOKER: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "JOKER: 提款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "JOKER: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/jokerx2/updatepassword/:userId",
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

      const updatePasswordResponse = await setJokerPassword(
        user,
        "2x",
        newpassword
      );
      if (!updatePasswordResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Failed to update password. Please try again or contact customer support for assistance.",
            zh: "JOKER: 更新密码失败。请重试或联系客服寻求帮助。",
            ms: "JOKER: Gagal mengemas kini kata laluan. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
            zh_hk: "JOKER: 更新密碼失敗。請重試或聯絡客服尋求協助。",
            id: "JOKER: Gagal memperbarui kata sandi. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Password updated successfully.",
          zh: "JOKER: 密码更新成功。",
          ms: "JOKER: Kata laluan berjaya dikemas kini.",
          zh_hk: "JOKER: 密碼更新成功。",
          id: "JOKER: Kata sandi berhasil diperbarui.",
        },
      });
    } catch (error) {
      console.log("JOKER error updating password:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Failed to update password due to a technical issue. Please try again or contact customer support for assistance.",
          zh: "JOKER: 由于技术问题更新密码失败。请重试或联系客服寻求帮助。",
          ms: "JOKER: Gagal mengemas kini kata laluan kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "JOKER: 由於技術問題更新密碼失敗。請重試或聯絡客服尋求協助。",
          id: "JOKER: Gagal memperbarui kata sandi karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jokerx2/setstatus/:playerId",
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

      const jokerStatus = status === true ? "Active" : "Suspend";

      const timestamp = moment().unix();

      const fields = {
        Method: "SS",
        Username: currentPlayer.gameId,
        Status: jokerStatus,
        Timestamp: timestamp,
      };

      const signature = generateSignature(fields, gameKEY);

      const response = await axios.post(
        `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
          signature
        )}`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.Status !== "OK") {
        console.log("failed to update status", response.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Failed to update player status. Please try again or contact customer support.",
            zh: "JOKER: 更新玩家状态失败。请重试或联系客服。",
            ms: "JOKER: Gagal mengemas kini status pemain. Sila cuba lagi atau hubungi sokongan pelanggan.",
            zh_hk: "JOKER: 更新玩家狀態失敗。請重試或聯絡客服。",
            id: "JOKER: Gagal memperbarui status pemain. Silakan coba lagi atau hubungi dukungan pelanggan.",
          },
        });
      }

      await User.findByIdAndUpdate(playerId, {
        "gameSuspendStatus.jokerx2.lock": status !== true,
      });

      return res.status(200).json({
        success: true,
        message: {
          en: `JOKER: Player status successfully updated to ${jokerStatus}.`,
          zh: `JOKER: 玩家状态已成功更新为${
            jokerStatus === "Active" ? "激活" : "暂停"
          }。`,
          ms: `JOKER: Status pemain berjaya dikemas kini kepada ${
            jokerStatus === "Active" ? "Aktif" : "Digantung"
          }.`,
          zh_hk: `JOKER: 玩家狀態已成功更新為${
            jokerStatus === "Active" ? "激活" : "暫停"
          }。`,
          id: `JOKER: Status pemain berhasil diperbarui menjadi ${
            jokerStatus === "Active" ? "Aktif" : "Ditangguhkan"
          }.`,
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to update player status:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to update player status due to a technical issue. Please try again or contact customer support.",
          zh: "JOKER: 由于技术问题更新玩家状态失败。请重试或联系客服。",
          ms: "JOKER: Gagal mengemas kini status pemain kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan.",
          zh_hk: "JOKER: 由於技術問題更新玩家狀態失敗。請重試或聯絡客服。",
          id: "JOKER: Gagal memperbarui status pemain karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan.",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jokerx2/forcelogout/:playerId",
  authenticateAdminToken,
  async (req, res) => {
    try {
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

      const timestamp = moment().unix();

      const fields = {
        Method: "SO",
        Username: currentPlayer.gameId,
        Timestamp: timestamp,
      };

      const signature = generateSignature(fields, gameKEY);

      const response = await axios.post(
        `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
          signature
        )}`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.Status !== "OK") {
        console.log("JOKER: Failed to force logout player:", response.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Failed to force player logout. Please try again or contact customer support.",
            zh: "JOKER: 强制玩家登出失败。请重试或联系客服。",
            ms: "JOKER: Gagal memaksa pemain log keluar. Sila cuba lagi atau hubungi sokongan pelanggan.",
            zh_hk: "JOKER: 強制玩家登出失敗。請重試或聯絡客服。",
            id: "JOKER: Gagal memaksa pemain logout. Silakan coba lagi atau hubungi dukungan pelanggan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Player successfully logged out.",
          zh: "JOKER: 玩家已成功登出。",
          ms: "JOKER: Pemain berjaya dilog keluar.",
          zh_hk: "JOKER: 玩家已成功登出。",
          id: "JOKER: Pemain berhasil logout.",
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to update player status:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to force player logout due to a technical issue. Please try again or contact customer support.",
          zh: "JOKER: 由于技术问题强制玩家登出失败。请重试或联系客服。",
          ms: "JOKER: Gagal memaksa pemain log keluar kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan.",
          zh_hk: "JOKER: 由於技術問題強制玩家登出失敗。請重試或聯絡客服。",
          id: "JOKER: Gagal memaksa pemain logout karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan.",
        },
      });
    }
  }
);

// 5倍场function
router.post(
  "/admin/api/jokerx5/register/:userId",
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

      const registerResponse = await registerJokerUser(user, "5x");
      if (!registerResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "JOKER: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "JOKER: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "JOKER: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "JOKER: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Account registered successfully.",
          zh: "JOKER: 账户注册成功。",
          ms: "JOKER: Akaun berjaya didaftarkan.",
          zh_hk: "JOKER: 帳戶註冊成功。",
          id: "JOKER: Akun berhasil didaftarkan.",
        },
        gameAccount: {
          gameID: `${gameAPPID}.5${user.gameId}`,
          gamePW: gamePassword,
        },
      });
    } catch (error) {
      console.log("JOKER error fetching balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Registration failed due to a technical issue. Please try again or contact customer support for assistance.",
          zh: "JOKER: 由于技术问题注册失败。请重试或联系客服寻求帮助。",
          ms: "JOKER: Pendaftaran gagal kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "JOKER: 由於技術問題註冊失敗。請重試或聯絡客服尋求協助。",
          id: "JOKER: Pendaftaran gagal karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/jokerx5/updatepassword/:userId",
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

      const updatePasswordResponse = await setJokerPassword(
        user,
        "5x",
        newpassword
      );
      if (!updatePasswordResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Failed to update password. Please try again or contact customer support for assistance.",
            zh: "JOKER: 更新密码失败。请重试或联系客服寻求帮助。",
            ms: "JOKER: Gagal mengemas kini kata laluan. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
            zh_hk: "JOKER: 更新密碼失敗。請重試或聯絡客服尋求協助。",
            id: "JOKER: Gagal memperbarui kata sandi. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Password updated successfully.",
          zh: "JOKER: 密码更新成功。",
          ms: "JOKER: Kata laluan berjaya dikemas kini.",
          zh_hk: "JOKER: 密碼更新成功。",
          id: "JOKER: Kata sandi berhasil diperbarui.",
        },
      });
    } catch (error) {
      console.log("JOKER error updating password:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Failed to update password due to a technical issue. Please try again or contact customer support for assistance.",
          zh: "JOKER: 由于技术问题更新密码失败。请重试或联系客服寻求帮助。",
          ms: "JOKER: Gagal mengemas kini kata laluan kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "JOKER: 由於技術問題更新密碼失敗。請重試或聯絡客服尋求協助。",
          id: "JOKER: Gagal memperbarui kata sandi karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/jokerx5/getbalance/:userId",
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

      const balanceResponse = await JokerCheckBalance(user, "5x");

      if (!balanceResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Unable to retrieve player balance. Please try again or contact customer support for assistance.",
            zh: "JOKER: 无法获取玩家余额。请重试或联系客服寻求帮助。",
            ms: "JOKER: Tidak dapat mendapatkan baki pemain. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
            zh_hk: "JOKER: 無法獲取玩家餘額。請重試或聯絡客服尋求協助。",
            id: "JOKER: Tidak dapat mengambil saldo pemain. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        balance: balanceResponse.data.Credit,
        outstanding: balanceResponse.data.OutstandingCredit,
      });
    } catch (error) {
      console.log("JOKER error fetching balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Unable to retrieve player balance. Please try again or contact customer support for assistance.",
          zh: "JOKER: 无法获取玩家余额。请重试或联系客服寻求帮助。",
          ms: "JOKER: Tidak dapat mendapatkan baki pemain. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "JOKER: 無法獲取玩家餘額。請重試或聯絡客服尋求協助。",
          id: "JOKER: Tidak dapat mengambil saldo pemain. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/jokerx5/deposit/:userId",
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

      if (!user.jokerGameTwoName) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Game account not registered. Please register an account first to proceed.",
            zh: "JOKER: 游戏账户未注册。请先注册账户以继续。",
            ms: "JOKER: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "JOKER: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "JOKER: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      if (user.gameStatus.jokerx5.transferInStatus) {
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

      const depositResponse = await JokerDeposit(
        user,
        formattedDepositAmount,
        "5x"
      );

      if (!depositResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Deposit failed. Please try again or contact customer support for further assistance.",
            zh: "JOKER: 存款失败。请重试或联系客服寻求进一步帮助。",
            ms: "JOKER: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "JOKER: 存款失敗。請重試或聯絡客服尋求進一步協助。",
            id: "JOKER: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        remark || "Transfer",
        roundToTwoDecimals(formattedDepositAmount),
        "JOKER X5",
        roundToTwoDecimals(depositResponse.data.Credit || 0),
        0,
        0
      );

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Deposit completed successfully.",
          zh: "JOKER: 存款成功完成。",
          ms: "JOKER: Deposit berjaya diselesaikan.",
          zh_hk: "JOKER: 存款成功完成。",
          id: "JOKER: Deposit berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("JOKER error deposit", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Deposit failed. Please try again or contact customer support for further assistance.",
          zh: "JOKER: 存款失败。请重试或联系客服寻求进一步帮助。",
          ms: "JOKER: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "JOKER: 存款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "JOKER: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/jokerx5/withdraw/:userId",
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

      if (!user.jokerGameTwoName) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Game account not registered. Please register an account first to proceed.",
            zh: "JOKER: 游戏账户未注册。请先注册账户以继续。",
            ms: "JOKER: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "JOKER: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "JOKER: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      if (user.gameStatus.jokerx5.transferOutStatus) {
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

      const withdrawResponse = await JokerWithdraw(
        user,
        formattedWithdrawAmount,
        "5x"
      );

      if (!withdrawResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Withdrawal failed. Please try again or contact customer support for further assistance.",
            zh: "JOKER: 提款失败。请重试或联系客服寻求进一步帮助。",
            ms: "JOKER: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "JOKER: 提款失敗。請重試或聯絡客服尋求進一步協助。",
            id: "JOKER: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer Out",
        remark || "Transfer",
        roundToTwoDecimals(formattedWithdrawAmount),
        "JOKER X5",
        roundToTwoDecimals(withdrawResponse.data.Credit || 0),
        0,
        0
      );

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Withdrawal completed successfully.",
          zh: "JOKER: 提款成功完成。",
          ms: "JOKER: Pengeluaran berjaya diselesaikan.",
          zh_hk: "JOKER: 提款成功完成。",
          id: "JOKER: Penarikan berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("JOKER error deposit", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JOKER: Withdrawal failed. Please try again or contact customer support for further assistance.",
          zh: "JOKER: 提款失败。请重试或联系客服寻求进一步帮助。",
          ms: "JOKER: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "JOKER: 提款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "JOKER: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jokerx5/setstatus/:playerId",
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

      const jokerStatus = status === true ? "Active" : "Suspend";

      const timestamp = moment().unix();

      const fields = {
        Method: "SS",
        Username: `5${currentPlayer.gameId}`,
        Status: jokerStatus,
        Timestamp: timestamp,
      };

      const signature = generateSignature(fields, gameKEY);

      const response = await axios.post(
        `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
          signature
        )}`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.Status !== "OK") {
        console.log("failed to update status", response.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Failed to update player status. Please try again or contact customer support.",
            zh: "JOKER: 更新玩家状态失败。请重试或联系客服。",
            ms: "JOKER: Gagal mengemas kini status pemain. Sila cuba lagi atau hubungi sokongan pelanggan.",
            zh_hk: "JOKER: 更新玩家狀態失敗。請重試或聯絡客服。",
            id: "JOKER: Gagal memperbarui status pemain. Silakan coba lagi atau hubungi dukungan pelanggan.",
          },
        });
      }

      await User.findByIdAndUpdate(playerId, {
        "gameSuspendStatus.jokerx5.lock": status !== true,
      });

      return res.status(200).json({
        success: true,
        message: {
          en: `JOKER: Player status successfully updated to ${jokerStatus}.`,
          zh: `JOKER: 玩家状态已成功更新为${
            jokerStatus === "Active" ? "激活" : "暂停"
          }。`,
          ms: `JOKER: Status pemain berjaya dikemas kini kepada ${
            jokerStatus === "Active" ? "Aktif" : "Digantung"
          }.`,
          zh_hk: `JOKER: 玩家狀態已成功更新為${
            jokerStatus === "Active" ? "激活" : "暫停"
          }。`,
          id: `JOKER: Status pemain berhasil diperbarui menjadi ${
            jokerStatus === "Active" ? "Aktif" : "Ditangguhkan"
          }.`,
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to update player status:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to update player status due to a technical issue. Please try again or contact customer support.",
          zh: "JOKER: 由于技术问题更新玩家状态失败。请重试或联系客服。",
          ms: "JOKER: Gagal mengemas kini status pemain kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan.",
          zh_hk: "JOKER: 由於技術問題更新玩家狀態失敗。請重試或聯絡客服。",
          id: "JOKER: Gagal memperbarui status pemain karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan.",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jokerx5/forcelogout/:playerId",
  authenticateAdminToken,
  async (req, res) => {
    try {
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

      const timestamp = moment().unix();

      const fields = {
        Method: "SO",
        Username: `5${currentPlayer.gameId}`,
        Timestamp: timestamp,
      };

      const signature = generateSignature(fields, gameKEY);

      const response = await axios.post(
        `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
          signature
        )}`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.Status !== "OK") {
        console.log("JOKER: Failed to force logout player:", response.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "JOKER: Failed to force player logout. Please try again or contact customer support.",
            zh: "JOKER: 强制玩家登出失败。请重试或联系客服。",
            ms: "JOKER: Gagal memaksa pemain log keluar. Sila cuba lagi atau hubungi sokongan pelanggan.",
            zh_hk: "JOKER: 強制玩家登出失敗。請重試或聯絡客服。",
            id: "JOKER: Gagal memaksa pemain logout. Silakan coba lagi atau hubungi dukungan pelanggan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "JOKER: Player successfully logged out.",
          zh: "JOKER: 玩家已成功登出。",
          ms: "JOKER: Pemain berjaya dilog keluar.",
          zh_hk: "JOKER: 玩家已成功登出。",
          id: "JOKER: Pemain berhasil logout.",
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to update player status:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to force player logout due to a technical issue. Please try again or contact customer support.",
          zh: "JOKER: 由于技术问题强制玩家登出失败。请重试或联系客服。",
          ms: "JOKER: Gagal memaksa pemain log keluar kerana masalah teknikal. Sila cuba lagi atau hubungi sokongan pelanggan.",
          zh_hk: "JOKER: 由於技術問題強制玩家登出失敗。請重試或聯絡客服。",
          id: "JOKER: Gagal memaksa pemain logout karena masalah teknis. Silakan coba lagi atau hubungi dukungan pelanggan.",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jokerx2/:playerId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
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

      const start = moment(new Date(startDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const end = moment(new Date(endDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const timestamp = moment().unix();

      const fields = {
        Method: "RWL",
        StartDate: start,
        EndDate: end,
        Username: currentPlayer.gameId,
        Timestamp: timestamp,
      };

      const signature = generateSignature(fields, gameKEY);

      const response = await axios.post(
        `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
          signature
        )}`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const totalTurnover = response.data.Winloss.reduce(
        (sum, record) => sum + record.Amount,
        0
      );
      const totalWin = response.data.Winloss.reduce(
        (sum, record) => sum + record.Result,
        0
      );
      const winloss = totalWin - totalTurnover;

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JOKERX2",
          gamecategory: "Slot Games",
          user: {
            username: currentPlayer.username,
            turnover: roundToTwoDecimals(totalTurnover),
            winloss: roundToTwoDecimals(winloss),
          },
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to fetch win/loss report",
          zh: "JOKER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jokerx2/kioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const start = moment(new Date(startDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const end = moment(new Date(endDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const timestamp = moment().unix();

      const fields = {
        Method: "RWL",
        StartDate: start,
        EndDate: end,
        Timestamp: timestamp,
      };

      const signature = generateSignature(fields, gameKEY);

      const response = await axios.post(
        `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
          signature
        )}`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const filteredRecords = response.data.Winloss.filter(
        (record) => !record.Username.startsWith("5A")
      );
      const totalTurnover = filteredRecords.reduce(
        (sum, record) => sum + record.Amount,
        0
      );
      const totalWin = filteredRecords.reduce(
        (sum, record) => sum + record.Result,
        0
      );
      const winloss = totalTurnover - totalWin;

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JOKERX2",
          gamecategory: "Slot Games",
          totalturnover: roundToTwoDecimals(totalTurnover),
          totalwinloss: roundToTwoDecimals(winloss),
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to fetch win/loss report",
          zh: "JOKER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jokerx5/:playerId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
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

      const start = moment(new Date(startDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const end = moment(new Date(endDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const timestamp = moment().unix();

      const fields = {
        Method: "RWL",
        StartDate: start,
        EndDate: end,
        Username: `5${currentPlayer.gameId}`,
        Timestamp: timestamp,
      };

      const signature = generateSignature(fields, gameKEY);

      const response = await axios.post(
        `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
          signature
        )}`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const totalTurnover = response.data.Winloss.reduce(
        (sum, record) => sum + record.Amount,
        0
      );
      const totalWin = response.data.Winloss.reduce(
        (sum, record) => sum + record.Result,
        0
      );
      const winloss = totalWin - totalTurnover;

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JOKERX5",
          gamecategory: "Slot Games",
          user: {
            username: currentPlayer.username,
            turnover: roundToTwoDecimals(totalTurnover),
            winloss: roundToTwoDecimals(winloss),
          },
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to fetch win/loss report",
          zh: "JOKER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jokerx5/kioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const start = moment(new Date(startDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const end = moment(new Date(endDate))
        .utc()
        .add(8, "hours")
        .format("YYYY-MM-DD");

      const timestamp = moment().unix();

      const fields = {
        Method: "RWL",
        StartDate: start,
        EndDate: end,
        Timestamp: timestamp,
      };

      const signature = generateSignature(fields, gameKEY);

      const response = await axios.post(
        `${gameAPIURL}?appid=${gameAPPID}&signature=${encodeURIComponent(
          signature
        )}`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const filteredRecords = response.data.Winloss.filter((record) =>
        record.Username.startsWith("5A")
      );

      const totalTurnover = filteredRecords.reduce(
        (sum, record) => sum + record.Amount,
        0
      );
      const totalWin = filteredRecords.reduce(
        (sum, record) => sum + record.Result,
        0
      );
      const winloss = totalTurnover - totalWin;

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JOKERX5",
          gamecategory: "Slot Games",
          totalturnover: roundToTwoDecimals(totalTurnover),
          totalwinloss: roundToTwoDecimals(winloss),
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to fetch win/loss report",
          zh: "JOKER: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
module.exports.registerJokerUser = registerJokerUser;
module.exports.JokerCheckBalance = JokerCheckBalance;
