const mongoose = require("mongoose");
const moment = require("moment-timezone");

const attendanceBonusSchema = new mongoose.Schema(
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
    userid: {
      type: String,
    },
    weekStart: {
      type: Date,
      required: true,
    },
    weekEnd: {
      type: Date,
      required: true,
    },
    weekLabel: {
      type: String,
      required: true,
    },
    dailyDeposits: {
      monday: { type: Boolean, default: false },
      tuesday: { type: Boolean, default: false },
      wednesday: { type: Boolean, default: false },
      thursday: { type: Boolean, default: false },
      friday: { type: Boolean, default: false },
      saturday: { type: Boolean, default: false },
      sunday: { type: Boolean, default: false },
    },
    totalDaysDeposited: {
      type: Number,
      default: 0,
      min: 0,
      max: 7,
    },
    isFullAttendance: {
      type: Boolean,
      default: false,
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

attendanceBonusSchema.index({ username: 1, weekStart: 1 }, { unique: true });
attendanceBonusSchema.index({ createdAt: -1 });

const AttendanceBonus = mongoose.model(
  "AttendanceBonus",
  attendanceBonusSchema
);

module.exports = { AttendanceBonus };
