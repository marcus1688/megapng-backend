const mongoose = require("mongoose");
const moment = require("moment");

const slotKaya918echema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },

    gameName: {
      type: String,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    username: {
      type: String,
    },
    bet: {
      type: Boolean,
    },
    settle: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    claimed: {
      type: Boolean,
      default: false,
    },
    disqualified: {
      type: Boolean,
      default: false,
    },
    betTime: {
      type: Date,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

slotKaya918echema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const slotKaya918Modal = mongoose.model("slotKaya918Modal", slotKaya918echema);

module.exports = slotKaya918Modal;
