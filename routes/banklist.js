const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authenticateAdminToken } = require("../auth/adminAuth");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const BankList = require("../models/banklist.model");
const BankTransactionLog = require("../models/banktransactionlog.model");
const Deposit = require("../models/deposit.model");
const Withdraw = require("../models/withdraw.model");
const { adminUser } = require("../models/adminuser.model");
const moment = require("moment");
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const upload = multer({ storage: multer.memoryStorage() });

// Client Get Bank List
router.get("/api/client/banklist", async (req, res) => {
  try {
    const bankLists = await BankList.find(
      { isActive: true },
      "_id bankaccount ownername bankname qrimage"
    );
    res.status(200).json({
      success: true,
      message: "Bank lists retrieved successfully",
      data: bankLists,
    });
  } catch (error) {
    console.error("Error occurred while retrieving bank lists:", error);
    res
      .status(200)
      .json({ message: "Internal server error", error: error.toString() });
  }
});

// Admin Get All Bank List
router.get("/admin/api/banklist", authenticateAdminToken, async (req, res) => {
  try {
    const bankLists = await BankList.find({});
    res.status(200).json({
      success: true,
      message: "Bank lists retrieved successfully",
      data: bankLists,
    });
  } catch (error) {
    console.error("Error occurred while retrieving bank lists:", error);
    res
      .status(200)
      .json({ message: "Internal server error", error: error.toString() });
  }
});

// Admin Create Bank List
router.post(
  "/admin/api/createbanklist",
  authenticateAdminToken,
  upload.single("qrimage"),
  async (req, res) => {
    try {
      const {
        bankname,
        bankaccount,
        ownername,
        fastpayment,
        transactionlimit,
        transactionamountlimit,
        remark,
        dailydepositamountlimit,
        dailywithdrawamountlimit,
        monthlydepositamountlimit,
        monthlywithdrawamountlimit,
      } = req.body;
      let qrImageUrl = null;
      if (req.file) {
        const folderPath = "banklists/";
        const fileKey = `${folderPath}${Date.now()}_${req.file.originalname}`;
        const putObjectCommand = new PutObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: fileKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        });

        await s3Client.send(putObjectCommand);
        qrImageUrl = `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
      }

      const newBankList = await BankList.create({
        bankname,
        bankaccount,
        ownername,
        fastpayment,
        transactionlimit,
        transactionamountlimit,
        remark,
        qrimage: qrImageUrl,
        dailydepositamountlimit: parseFloat(dailydepositamountlimit) || 0,
        dailywithdrawamountlimit: parseFloat(dailywithdrawamountlimit) || 0,
        monthlydepositamountlimit: parseFloat(monthlydepositamountlimit) || 0,
        monthlywithdrawamountlimit: parseFloat(monthlywithdrawamountlimit) || 0,
      });

      res.status(200).json({
        success: true,
        message: {
          en: "Bank List created successfully",
          zh: "银行列表创建成功",
        },
        data: newBankList,
      });
    } catch (error) {
      console.error("Error occurred while creating bank list:", error);
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

// Admin Update Bank List
router.patch(
  "/admin/api/updatebank/:id",
  authenticateAdminToken,
  upload.single("qrimage"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const existingBank = await BankList.findById(id);
      if (!existingBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "找不到银行列表",
          },
        });
      }

      let qrImageUrl = existingBank.qrimage;

      if (req.file && qrImageUrl) {
        const url = new URL(qrImageUrl);
        const key = url.pathname.substring(1);

        const deleteObjectCommand = new DeleteObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: key,
        });

        await s3Client.send(deleteObjectCommand);
      }

      if (req.file) {
        const folderPath = "banklists/";
        const fileKey = `${folderPath}${Date.now()}_${req.file.originalname}`;
        const putObjectCommand = new PutObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: fileKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        });

        try {
          await s3Client.send(putObjectCommand);
          qrImageUrl = `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
        } catch (uploadError) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Error uploading image to S3",
              zh: "上传图片到S3时出错",
            },
          });
        }
      }

      const updateData = {
        bankname: req.body.bankname,
        bankaccount: req.body.bankaccount,
        ownername: req.body.ownername,
        fastpayment: req.body.fastpayment,
        transactionlimit: req.body.transactionlimit,
        transactionamountlimit: req.body.transactionamountlimit,
        remark: req.body.remark,
        qrimage: qrImageUrl,
        dailydepositamountlimit:
          parseFloat(req.body.dailydepositamountlimit) || 0,
        dailywithdrawamountlimit:
          parseFloat(req.body.dailywithdrawamountlimit) || 0,
        monthlydepositamountlimit:
          parseFloat(req.body.monthlydepositamountlimit) || 0,
        monthlywithdrawamountlimit:
          parseFloat(req.body.monthlywithdrawamountlimit) || 0,
      };

      const updatedBank = await BankList.findByIdAndUpdate(id, updateData, {
        new: true,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "Bank list updated successfully",
          zh: "银行列表更新成功",
        },
        data: updatedBank,
      });
    } catch (error) {
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

// Admin Delete Bank List
router.delete(
  "/admin/api/deletebanklist/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const bank = await BankList.findById(req.params.id);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "未找到银行列表",
          },
        });
      }

      if (bank.qrimage) {
        const url = new URL(bank.qrimage);
        const key = decodeURIComponent(url.pathname.substring(1));

        const deleteObjectCommand = new DeleteObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: key,
        });

        await s3Client.send(deleteObjectCommand);
      }

      const deletedBank = await BankList.findOneAndDelete({
        _id: req.params.id,
      });
      if (!deletedBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "未找到银行列表",
          },
        });
      }

      res.status(200).json({
        success: true,
        message: {
          en: "Bank list deleted successfully",
          zh: "银行列表删除成功",
        },
        data: deletedBank,
      });
    } catch (error) {
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

// Admin Update Bank Status
router.patch(
  "/admin/api/updateactivebank",
  authenticateAdminToken,
  async (req, res) => {
    const { id, isActive } = req.body;
    try {
      const updatedBank = await BankList.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      );
      if (!updatedBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank not found",
            zh: "未找到银行",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Bank status updated successfully",
          zh: "银行状态更新成功",
        },
        data: updatedBank,
      });
    } catch (error) {
      console.error("Error updating bank's active status:", error);
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

// Admin Update Starting Balance
router.patch(
  "/admin/api/updatestartingbalance",
  authenticateAdminToken,
  async (req, res) => {
    const { id, startingBalance, remark } = req.body;
    const balance = parseFloat(startingBalance);
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
      const bank = await BankList.findById(id);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "找不到银行列表",
          },
        });
      }
      const oldBalance = bank.currentbalance;
      bank.startingbalance = balance;
      bank.currentbalance =
        bank.startingbalance +
        bank.totalDeposits -
        bank.totalWithdrawals +
        bank.totalCashIn -
        bank.totalCashOut -
        bank.totalTransactionFees;
      await bank.save();
      const transactionLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        remark: remark,
        lastBalance: oldBalance,
        currentBalance: bank.currentbalance,
        processby: adminuser.username,
        transactiontype: "adjust starting balance",
        amount: balance,
        qrimage: bank.qrimage,
        playerusername: "n/a",
        playerfullname: "n/a",
      });
      await transactionLog.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Starting balance updated successfully",
          zh: "初始余额更新成功",
        },
        data: bank,
      });
    } catch (error) {
      console.error("Error updating starting balance:", error);
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

// Admin Cash In
router.post("/admin/api/cashin", authenticateAdminToken, async (req, res) => {
  const { id, amount, remark, transactionDate, affectTotal } = req.body;
  const cashInAmount = parseFloat(amount);
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
    const bank = await BankList.findById(id);
    if (!bank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank list not found",
          zh: "找不到银行列表",
        },
      });
    }

    const customDate = transactionDate
      ? moment(transactionDate).utc().toDate()
      : null;
    const isBackdated =
      customDate && moment(customDate).isBefore(moment(), "day");

    if (isBackdated) {
      const previousTransaction = await BankTransactionLog.findOne({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        createdAt: { $lt: customDate },
      }).sort({ createdAt: -1, _id: -1 });

      const balanceBeforeInsert = previousTransaction
        ? previousTransaction.currentBalance
        : bank.startingbalance;

      const newTransaction = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        remark: remark || "-",
        lastBalance: balanceBeforeInsert,
        currentBalance: balanceBeforeInsert + cashInAmount,
        processby: adminuser.username,
        transactiontype: affectTotal ? "cashin" : "adjustin",
        amount: cashInAmount,
        qrimage: bank.qrimage,
        playerusername: "n/a",
        playerfullname: "n/a",
        createdAt: customDate,
        updatedAt: customDate,
      });
      await newTransaction.save();

      const subsequentTransactions = await BankTransactionLog.find({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        createdAt: { $gte: customDate },
        _id: { $ne: newTransaction._id },
      }).sort({ createdAt: 1, _id: 1 });

      let runningBalance = newTransaction.currentBalance;
      for (const txn of subsequentTransactions) {
        const txnAmount = txn.amount || 0;
        txn.lastBalance = runningBalance;
        if (
          txn.transactiontype === "deposit" ||
          txn.transactiontype === "cashin"
        ) {
          txn.currentBalance = runningBalance + txnAmount;
        } else if (
          txn.transactiontype === "withdraw" ||
          txn.transactiontype === "cashout" ||
          txn.transactiontype === "transactionfee"
        ) {
          txn.currentBalance = runningBalance - txnAmount;
        }
        runningBalance = txn.currentBalance;
        await txn.save();
      }
      bank.currentbalance = runningBalance;
      bank.totalCashIn += cashInAmount;
      await bank.save();
    } else {
      const oldBalance = bank.currentbalance;
      bank.totalCashIn += cashInAmount;
      bank.currentbalance += cashInAmount;
      await bank.save();

      const transactionLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        remark: remark || "-",
        lastBalance: oldBalance,
        currentBalance: bank.currentbalance,
        processby: adminuser.username,
        transactiontype: affectTotal ? "cashin" : "adjustin",
        amount: cashInAmount,
        qrimage: bank.qrimage,
        playerusername: "n/a",
        playerfullname: "n/a",
      });
      await transactionLog.save();
    }

    res.status(200).json({
      success: true,
      message: {
        en: "Cash in processed successfully",
        zh: "现金存入处理成功",
      },
      data: bank,
    });
  } catch (error) {
    console.error("Error processing cash in:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Admin Cash Out
router.post("/admin/api/cashout", authenticateAdminToken, async (req, res) => {
  const { id, amount, remark, transactionDate, affectTotal } = req.body;
  const cashOutAmount = parseFloat(amount);
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
    const bank = await BankList.findById(id);
    if (!bank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank list not found",
          zh: "找不到银行列表",
        },
      });
    }
    const customDate = transactionDate
      ? moment(transactionDate).utc().toDate()
      : null;
    const isBackdated =
      customDate && moment(customDate).isBefore(moment(), "day");
    if (isBackdated) {
      const previousTransaction = await BankTransactionLog.findOne({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        createdAt: { $lt: customDate },
      }).sort({ createdAt: -1, _id: -1 });
      const balanceBeforeInsert = previousTransaction
        ? previousTransaction.currentBalance
        : bank.startingbalance;
      if (balanceBeforeInsert < cashOutAmount) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Insufficient balance at that date",
            zh: "该日期余额不足",
          },
        });
      }
      const newTransaction = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        remark: remark || "-",
        lastBalance: balanceBeforeInsert,
        currentBalance: balanceBeforeInsert - cashOutAmount,
        processby: adminuser.username,
        transactiontype: affectTotal ? "cashout" : "adjustout",
        amount: cashOutAmount,
        qrimage: bank.qrimage,
        playerusername: "n/a",
        playerfullname: "n/a",
        createdAt: customDate,
        updatedAt: customDate,
      });
      await newTransaction.save();
      const subsequentTransactions = await BankTransactionLog.find({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        createdAt: { $gte: customDate },
        _id: { $ne: newTransaction._id },
      }).sort({ createdAt: 1, _id: 1 });
      let runningBalance = newTransaction.currentBalance;
      for (const txn of subsequentTransactions) {
        const txnAmount = txn.amount || 0;
        const oldCurrentBalance = txn.currentBalance;
        txn.lastBalance = runningBalance;
        if (
          txn.transactiontype === "deposit" ||
          txn.transactiontype === "cashin"
        ) {
          txn.currentBalance = runningBalance + txnAmount;
        } else if (
          txn.transactiontype === "withdraw" ||
          txn.transactiontype === "cashout" ||
          txn.transactiontype === "transactionfee"
        ) {
          txn.currentBalance = runningBalance - txnAmount;
        }
        runningBalance = txn.currentBalance;
        await txn.save();
      }
      bank.currentbalance = runningBalance;
      bank.totalCashOut += cashOutAmount;
      await bank.save();
    } else {
      if (bank.currentbalance < cashOutAmount) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Insufficient balance",
            zh: "余额不足",
          },
        });
      }
      const oldBalance = bank.currentbalance;
      bank.totalCashOut += cashOutAmount;
      bank.currentbalance -= cashOutAmount;
      await bank.save();
      const transactionLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        remark: remark || "-",
        lastBalance: oldBalance,
        currentBalance: bank.currentbalance,
        processby: adminuser.username,
        transactiontype: affectTotal ? "cashout" : "adjustout",
        amount: cashOutAmount,
        qrimage: bank.qrimage,
        playerusername: "n/a",
        playerfullname: "n/a",
      });
      await transactionLog.save();
    }
    res.status(200).json({
      success: true,
      message: {
        en: "Cash out processed successfully",
        zh: "现金提取处理成功",
      },
      data: bank,
    });
  } catch (error) {
    console.error("Error processing cash out:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Admin Get Bank Report
router.get(
  "/admin/api/bankreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const banks = await BankList.find({});
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const depositStats = await Deposit.aggregate([
        {
          $match: {
            status: "approved",
            reverted: false,
            bankid: { $in: banks.map((b) => b._id.toString()) },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$bankid",
            totalDeposits: {
              $sum: { $ifNull: ["$bankAmount", "$amount"] },
            },
          },
        },
      ]);

      const withdrawStats = await Withdraw.aggregate([
        {
          $match: {
            status: "approved",
            reverted: false,
            bankid: { $in: banks.map((b) => b._id.toString()) },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$bankid",
            totalWithdrawals: {
              $sum: { $ifNull: ["$bankAmount", "$amount"] },
            },
          },
        },
      ]);

      const cashStats = await BankTransactionLog.aggregate([
        {
          $match: {
            bankAccount: { $in: banks.map((b) => b.bankaccount) },
            transactiontype: {
              $in: [
                "cashin",
                "cashout",
                "adjustin",
                "adjustout",
                "transactionfee",
              ],
            },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$bankAccount",
            totalCashIn: {
              $sum: {
                $cond: [{ $eq: ["$transactiontype", "cashin"] }, "$amount", 0],
              },
            },
            totalAdjustIn: {
              $sum: {
                $cond: [
                  { $eq: ["$transactiontype", "adjustin"] },
                  "$amount",
                  0,
                ],
              },
            },
            totalCashOut: {
              $sum: {
                $cond: [{ $eq: ["$transactiontype", "cashout"] }, "$amount", 0],
              },
            },
            totalAdjustOut: {
              $sum: {
                $cond: [
                  { $eq: ["$transactiontype", "adjustout"] },
                  "$amount",
                  0,
                ],
              },
            },
            totalTransactionFees: {
              $sum: {
                $cond: [
                  { $eq: ["$transactiontype", "transactionfee"] },
                  "$amount",
                  0,
                ],
              },
            },
          },
        },
      ]);

      const depositMap = new Map(depositStats.map((s) => [s._id, s]));
      const withdrawMap = new Map(withdrawStats.map((s) => [s._id, s]));
      const cashMap = new Map(cashStats.map((s) => [s._id, s]));

      const reportData = banks.map((bank) => {
        const bankIdStr = bank._id.toString();
        const depositStat = depositMap.get(bankIdStr) || {};
        const withdrawStat = withdrawMap.get(bankIdStr) || {};
        const cashStat = cashMap.get(bank.bankaccount) || {};

        return {
          id: bank._id,
          bankName: bank.bankname,
          bankAccount: bank.bankaccount,
          ownername: bank.ownername,
          totalDeposit:
            (depositStat.totalDeposits || 0) + (cashStat.totalCashIn || 0),
          totalWithdraw:
            (withdrawStat.totalWithdrawals || 0) + (cashStat.totalCashOut || 0),
          totalCashIn: cashStat.totalCashIn || 0,
          totalCashOut: cashStat.totalCashOut || 0,
          totalAdjustIn: cashStat.totalAdjustIn || 0,
          totalAdjustOut: cashStat.totalAdjustOut || 0,
          totalTransactionFees: cashStat.totalTransactionFees || 0,
          currentBalance: bank.currentbalance,
        };
      });

      const totals = reportData.reduce(
        (acc, bank) => ({
          totalDeposit: (acc.totalDeposit || 0) + bank.totalDeposit,
          totalWithdraw: (acc.totalWithdraw || 0) + bank.totalWithdraw,
          totalCashIn: (acc.totalCashIn || 0) + bank.totalCashIn,
          totalCashOut: (acc.totalCashOut || 0) + bank.totalCashOut,
          totalAdjustIn: (acc.totalAdjustIn || 0) + bank.totalAdjustIn,
          totalAdjustOut: (acc.totalAdjustOut || 0) + bank.totalAdjustOut,
          totalTransactionFees:
            (acc.totalTransactionFees || 0) + bank.totalTransactionFees,
        }),
        {}
      );

      res.status(200).json({
        success: true,
        message: "Report data retrieved successfully",
        data: {
          reports: reportData,
          totals,
        },
      });
    } catch (error) {
      console.error("Error generating bank report:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

// Admnin Cashout Transaction Fees
router.post(
  "/admin/api/transactionfeescashout",
  authenticateAdminToken,
  async (req, res) => {
    const { id, amount } = req.body;
    const cashOutAmount = parseFloat(amount);
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
      const bank = await BankList.findById(id);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "找不到银行列表",
          },
        });
      }
      const customDate = moment()
        .utcOffset(8)
        .subtract(1, "day")
        .set({
          hour: 23,
          minute: 59,
          second: 50,
          millisecond: 0,
        })
        .utc()
        .toDate();
      const remark = "transaction fees";
      const previousTransaction = await BankTransactionLog.findOne({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        createdAt: { $lt: customDate },
      }).sort({ createdAt: -1, _id: -1 });
      const balanceBeforeInsert = previousTransaction
        ? previousTransaction.currentBalance
        : bank.startingbalance;
      if (balanceBeforeInsert < cashOutAmount) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Insufficient balance at that date",
            zh: "该日期余额不足",
          },
        });
      }
      const newTransaction = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        remark: remark,
        lastBalance: balanceBeforeInsert,
        currentBalance: balanceBeforeInsert - cashOutAmount,
        processby: adminuser.username,
        transactiontype: "transactionfee",
        amount: cashOutAmount,
        qrimage: bank.qrimage,
        playerusername: "n/a",
        playerfullname: "n/a",
        createdAt: customDate,
        updatedAt: customDate,
      });
      await newTransaction.save();
      const subsequentTransactions = await BankTransactionLog.find({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        createdAt: { $gte: customDate },
        _id: { $ne: newTransaction._id },
      }).sort({ createdAt: 1, _id: 1 });
      let runningBalance = newTransaction.currentBalance;
      for (const txn of subsequentTransactions) {
        const txnAmount = txn.amount || 0;
        txn.lastBalance = runningBalance;
        const type = txn.transactiontype.toLowerCase();
        if (type === "deposit" || type === "cashin") {
          txn.currentBalance = runningBalance + txnAmount;
        } else if (
          type === "withdraw" ||
          type === "cashout" ||
          type === "transactionfee"
        ) {
          txn.currentBalance = runningBalance - txnAmount;
        } else if (type === "reverted deposit") {
          txn.currentBalance = runningBalance - txnAmount;
        } else if (type === "reverted withdraw") {
          txn.currentBalance = runningBalance + txnAmount;
        } else {
          txn.currentBalance = runningBalance;
        }
        runningBalance = txn.currentBalance;
        await txn.save();
      }
      bank.currentbalance = runningBalance;
      bank.totalTransactionFees += cashOutAmount;
      await bank.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Transaction fees processed successfully",
          zh: "交易费用处理成功",
        },
        data: bank,
      });
    } catch (error) {
      console.error("Error processing transaction fees:", error);
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

// Admin Toggle Transaction Type
router.patch(
  "/admin/api/toggletransactiontype",
  authenticateAdminToken,
  async (req, res) => {
    const { id, newType } = req.body;
    try {
      const validTypes = ["cashin", "adjustin", "cashout", "adjustout"];
      if (!validTypes.includes(newType)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid transaction type",
            zh: "无效的交易类型",
          },
        });
      }

      const transaction = await BankTransactionLog.findById(id);
      if (!transaction) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Transaction not found",
            zh: "交易记录未找到",
          },
        });
      }

      transaction.transactiontype = newType;
      await transaction.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Transaction type updated successfully",
          zh: "交易类型更新成功",
        },
      });
    } catch (error) {
      console.error("Error toggling transaction type:", error);
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
