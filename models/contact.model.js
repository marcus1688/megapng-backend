const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    username: String,
    name: String,
    phonenumber: String,
    email: String,
  },
  {
    timestamps: true,
  }
);

const Contact = mongoose.model("Contact", contactSchema);

module.exports = { Contact };
