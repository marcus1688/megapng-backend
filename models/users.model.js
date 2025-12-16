const mongoose = require("mongoose");
const moment = require("moment");

const bankAccountSchema = new mongoose.Schema({
  name: String,
  bankcode: String,
  bankname: String, // 银行名称
  banknumber: String, // 银行账号
});

const userLuckySpinSettingSchema = new mongoose.Schema(
  {
    settings: [
      {
        name: { type: String, required: true },
        angle: { type: Number, required: true },
        probability: { type: Number, required: true },
        value: { type: Number, required: true },
      },
    ],
    remainingCount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { _id: false, timestamps: false }
);

const cryptoSchema = new mongoose.Schema({
  crypto_currency: String,
  crypto_active: Boolean,
  crypto_address: String,
  crypto_qrimage: String,
  crypto_customerid: String,
  crypto_accountid: String,
  crypto_accountbalance: String,
  crypto_availablebalance: String,
});

const gameStatusSchema = new mongoose.Schema(
  {
    transferInStatus: {
      type: Boolean,
      default: false,
    },
    transferOutStatus: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);
const gameLockSchema = new mongoose.Schema(
  {
    lock: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const dailyGameAmountsSchema = new mongoose.Schema(
  {
    "Slot Games": {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    "E-Sports": {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Fishing: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Horse: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Lottery: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    "Mah Jong": {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Poker: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    "Live Casino": {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Sports: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    userid: {
      type: Number,
      unique: true,
      sparse: true,
    },
    gameId: String,
    evolutionUserId: Number,
    email: String,
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpires: { type: Date },
    fullname: { type: String, required: true },
    username: String,
    email: String,
    registerVisitorId: {
      type: String,
      unique: true,
      sparse: true,
    },
    phonenumber: Number,
    phoneNumbers: [
      {
        type: String,
      },
    ],
    password: String,
    confirmpassword: String,
    wallet: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0"),
      set: function (v) {
        // const formatted = parseFloat(v).toFixed(2);
        // return mongoose.Types.Decimal128.fromString(formatted);
        const formatted = parseFloat(v).toFixed(4);
        return mongoose.Types.Decimal128.fromString(formatted);
      },
      get: function (v) {
        if (v) return parseFloat(v.toString());
        return 0;
      },
    },
    wallettwo: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0"),
      set: function (v) {
        // const formatted = parseFloat(v).toFixed(2);
        // return mongoose.Types.Decimal128.fromString(formatted);
        const formatted = parseFloat(v).toFixed(4);
        return mongoose.Types.Decimal128.fromString(formatted);
      },
      get: function (v) {
        if (v) return parseFloat(v.toString());
        return 0;
      },
    },
    dob: String,
    referralLink: { type: String },
    referralCode: { type: String },
    referralQrCode: { type: String },
    luckySpinAmount: { type: String, default: "0" },
    luckySpinClaim: { type: Boolean, default: false },
    bankAccounts: [bankAccountSchema],
    cryptoWallet: [cryptoSchema],
    positionTaking: {
      type: String,
      default: "0",
    },
    status: {
      type: Boolean,
      default: true,
    },
    firstDepositDate: {
      type: Date,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    lastLoginIp: {
      type: String,
      default: "-",
    },
    registerIp: {
      type: String,
      default: "-",
    },
    referrals: [
      {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        userid: { type: Number },
        username: { type: String },
        _id: false,
      },
    ],
    referralBy: {
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      userid: { type: Number },
      username: { type: String },
      _id: false,
    },
    viplevel: {
      type: String,
      default: "member",
    },
    thisMonthVip: {
      type: String,
      default: null,
    },
    telegramId: {
      type: String,
      default: null,
    },
    facebookId: {
      type: String,
      default: null,
    },
    highestVipLevel: {
      type: String,
      default: "normal", // default to the initial VIP level
    },
    highestVipLevelDate: {
      type: Date,
      default: new Date(Date.now() + 8 * 60 * 60 * 1000), // Track the date when the highest VIP level was achieved
    },
    monthlyBonusCountdownTime: { type: Number, default: 0 },
    monthlyLoyaltyCountdownTime: { type: Number, default: 0 },
    weeklySignInTime: { type: Number, default: 0 },
    lastClaimedVipLevel: {
      type: String,
      default: "normal", // Default to the initial VIP level
    },
    alert: {
      type: String,
      enum: {
        values: ["Yes", "No"],
      },
      default: "No",
    },
    abnormal: {
      type: String,
      enum: {
        values: ["Yes", "No"],
      },
      default: "No",
    },
    agentLevel: {
      type: Number,
      default: 0,
    },
    withdrawlock: {
      type: Boolean,
      default: false,
    },
    duplicateIP: {
      type: Boolean,
      default: false,
    },
    duplicateBank: {
      type: Boolean,
      default: false,
    },
    remark: {
      type: String,
    },

    rebate: { type: Number, default: 0 },
    turnover: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0"),
      set: function (v) {
        const formatted = parseFloat(v).toFixed(2);
        return mongoose.Types.Decimal128.fromString(formatted);
      },
      get: function (v) {
        if (v) return parseFloat(v.toString());
        return 0;
      },
    },
    totalturnover: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0"),
      set: function (v) {
        const formatted = parseFloat(v).toFixed(2);
        return mongoose.Types.Decimal128.fromString(formatted);
      },
      get: function (v) {
        if (v) return parseFloat(v.toString());
        return 0;
      },
    },
    winloss: { type: Number, default: 0 },
    gamewallet: { type: Number, default: 0 },
    totaldeposit: { type: Number, default: 0 },
    totalwithdraw: { type: Number, default: 0 },
    totalbonus: { type: Number, default: 0 },
    lastdepositdate: {
      type: Date,
      default: null,
    },
    adminMagicToken: String,
    adminMagicTokenExpires: Date,
    adminMagicTokenUsed: { type: Boolean, default: false },
    lastAdminAccess: { type: Date, default: null },
    lastAdminAccessBy: String,
    gameLock: {
      // habanero: { type: gameLockSchema, default: () => ({}) },
    },
    gameStatus: {
      mega888: { type: gameStatusSchema, default: () => ({}) },
    },
    gameSuspendStatus: {
      mega888: { type: gameLockSchema, default: () => ({}) },
    },
    lastForcedLogout: { type: Date, default: null },
    luckySpinCount: {
      type: Number,
      default: 0,
    },
    luckySpinSetting: {
      type: userLuckySpinSettingSchema,
      default: () => ({ settings: [], remainingCount: 0 }),
    },
    mega888GameName: {
      type: String,
    },
    mega888GamePW: {
      type: String,
    },
    pastMega888GameName: {
      type: String,
    },
    pastMega888GamePW: {
      type: String,
    },
  },
  {
    toJSON: { getters: true },
    toObject: { getters: true },
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const logSchema = new mongoose.Schema(
  {
    company: {
      type: String,
    },
    fullname: String,
    username: String,
    phonenumber: Number,
    loginTime: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
    },
    ipaddress: {
      type: String,
    },
    ipcountry: {
      type: String,
    },
    ipcity: {
      type: String,
    },
    remark: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

const adminUserWalletLogSchema = new mongoose.Schema(
  {
    company: {
      type: String,
    },
    username: String,
    transactionId: String,
    transactiontime: { type: Date, default: Date.now },
    transactiontype: String,
    transferamount: Number,
    gamename: String,
    userwalletbalance: Number,
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

const userGameDataSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    gameHistory: {
      type: Map,
      of: dailyGameAmountsSchema,
      default: new Map(),
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const gameDataLogSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    gameCategories: {
      type: Map,
      of: {
        type: Map,
        of: {
          turnover: {
            type: Number,
            default: 0,
          },
          winloss: {
            type: Number,
            default: 0,
          },
        },
      },
      default: new Map(),
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

adminUserWalletLogSchema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 5256000 }
);
logSchema.index({ createdAt: -1 }, { expireAfterSeconds: 5260000 });
gameDataLogSchema.index({ createdAt: -1 }, { expireAfterSeconds: 5260000 });

const adminUserWalletLog = mongoose.model(
  "adminUserWalletLog",
  adminUserWalletLogSchema
);
const userLog = mongoose.model("userLog", logSchema);
const User = mongoose.model("User", userSchema);
const UserGameData = mongoose.model("UserGameData", userGameDataSchema);
const GameDataLog = mongoose.model("GameDataLog", gameDataLogSchema);
module.exports = {
  User,
  userLog,
  adminUserWalletLog,
  UserGameData,
  GameDataLog,
};
