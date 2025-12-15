const mongoose = require("mongoose");
const moment = require("moment-timezone");

const loyaltyBonusSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    userid: {
      type: String,
    },
    username: {
      type: String,
      required: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    periodLabel: {
      type: String,
    },
    periodType: {
      type: String,
      enum: ["first_half", "second_half"],
      required: true,
    },
    totalDeposit: {
      type: Number,
      default: 0,
    },
    tier: {
      type: String,
      enum: ["none", "tier1", "tier2", "tier3", "tier4"],
      default: "none",
    },
    bonusPoints: {
      type: Number,
      default: 0,
    },
    claimed: {
      type: Boolean,
      default: false,
    },
    claimedBy: {
      type: String,
    },
    claimedAt: {
      type: Date,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().tz("Asia/Kuala_Lumpur").toDate(),
    },
  }
);

loyaltyBonusSchema.index({ username: 1, periodStart: 1 }, { unique: true });
loyaltyBonusSchema.index({ createdAt: -1 });

module.exports = mongoose.model("LoyaltyBonus", loyaltyBonusSchema);
