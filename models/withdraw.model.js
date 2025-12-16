const mongoose = require("mongoose");
const moment = require("moment");

const withdrawSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userid: { type: String },
    username: {
      type: String,
      required: true,
    },
    fullname: {
      type: String,
      required: true,
    },
    bankid: {
      type: String,
    },
    bankname: {
      type: String,
    },
    ownername: {
      type: String,
    },
    transfernumber: {
      type: String,
    },
    transactionType: {
      type: String,
      required: true,
    },
    walletType: {
      type: String,
      required: true,
      default: "Main",
    },
    processBy: {
      type: String,
      required: true,
      default: "Admin",
    },
    amount: {
      type: Number,
      required: true,
    },
    bankAmount: {
      type: Number,
      default: null,
    },
    walletamount: {
      type: Number,
    },
    method: {
      type: String,
    },
    withdrawbankid: {
      type: String,
    },
    status: {
      type: String,
      default: "pending",
    },
    game: {
      type: String,
    },
    remark: {
      type: String,
    },
    reverted: {
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
    revertedProcessBy: {
      type: String,
    },
    processtime: {
      type: String,
      default: "PENDING",
    },
    depositname: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

withdrawSchema.index({ createdAt: -1 });
withdrawSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

const Withdraw = mongoose.model("withdraw", withdrawSchema);

module.exports = Withdraw;
