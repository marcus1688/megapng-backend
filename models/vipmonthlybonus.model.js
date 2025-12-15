const mongoose = require("mongoose");
const moment = require("moment-timezone");

const vipMonthlyBonusSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userid: {
      type: String,
    },
    username: {
      type: String,
      required: true,
    },
    monthStart: {
      type: Date,
      required: true,
    },
    monthEnd: {
      type: Date,
      required: true,
    },
    monthLabel: {
      type: String,
      required: true,
    },
    viplevel: {
      type: String,
      default: null,
    },
    thisMonthVip: {
      type: String,
      default: null,
    },
    bonusAmount: {
      type: Number,
      default: 0,
    },
    claimed: {
      type: Boolean,
      default: false,
    },
    claimedBy: {
      type: String,
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

vipMonthlyBonusSchema.index({ username: 1, monthStart: 1 }, { unique: true });
vipMonthlyBonusSchema.index({ createdAt: -1 });

const VipMonthlyBonus = mongoose.model(
  "VipMonthlyBonus",
  vipMonthlyBonusSchema
);
module.exports = VipMonthlyBonus;
