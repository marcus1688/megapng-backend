const mongoose = require("mongoose");

// Game data sub-schema for individual games within each category
const gameDataSchema = new mongoose.Schema(
  {
    gameName: {
      type: String,
      required: true,
    },
    totalTurnover: {
      type: Number,
    },
  },
  { _id: false }
);

// Category data sub-schema (Live, Sports, Others)
const categoryDataSchema = new mongoose.Schema(
  {
    games: [gameDataSchema],
  },
  { _id: false }
);

// Main instant rebate schema
const instantRebateSchema = new mongoose.Schema(
  {
    timeCalled: {
      type: Date,
      default: Date.now,
      required: true,
    },
    username: {
      type: String,
      required: true,
      uppercase: true,
    },
    live: categoryDataSchema,
    sports: categoryDataSchema,
    others: categoryDataSchema,
    totalCommission: {
      type: Number,
    },
    formula: {
      type: String,
      required: true,
    },
    grandTotalTurnover: {
      type: Number,
    },
    processed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const InstantRebate = mongoose.model("InstantRebate", instantRebateSchema);

module.exports = InstantRebate;
