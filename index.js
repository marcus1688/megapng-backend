const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
if (process.env.PAUSE_SERVICE === "true") {
  console.log("Service is paused");
  process.exit(0);
}
const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const WebSocket = require("ws");
const {
  clearCookie,
  authenticateToken,
  generateToken: userGenerateToken,
} = require("./auth/auth");

const {
  authenticateAdminToken,
  generateToken: adminGenerateToken,
} = require("./auth/adminAuth");
const AttendanceBonusRouter = require("./routes/attendancebonus");
const LoyaltyBonusRouter = require("./routes/loyaltybonus");
const usersRouter = require("./routes/users");
const depositRouter = require("./routes/deposit");
const adminUserRouter = require("./routes/adminuser");
const myPromotionRouter = require("./routes/mypromotion");
const withdrawRouter = require("./routes/withdraw");
const banklistRouter = require("./routes/banklist");
const userbanklistRouter = require("./routes/userbanklist");
const carouselRouter = require("./routes/carousel");
const BankTransactionLogRouter = require("./routes/banktransactionlog");
const UserWalletLogRouter = require("./routes/userwalletlog");
const promotionRouter = require("./routes/promotion");
const vipRouter = require("./routes/vip");
const popUpRouter = require("./routes/popup");
const BonusRouter = require("./routes/bonus");
const LuckySpinRouter = require("./routes/luckyspin");
const InformationRouter = require("./routes/information");
const ReviewRouter = require("./routes/review");
const LeaderboardRouter = require("./routes/leaderboard");
const BlogRouter = require("./routes/blog");
const MailRouter = require("./routes/mail");
const AnnouncementRouter = require("./routes/announcement");
const AnnouncementCategoryRouter = require("./routes/announcementcategory");
const HelpRouter = require("./routes/help");
const FeedbackRouter = require("./routes/feedback");
const PromoCodeRouter = require("./routes/promocode");
const MemoRouter = require("./routes/memo");
const GeneralRouter = require("./routes/general");
const KioskCategoryRouter = require("./routes/kioskcategory");
const Kiosk = require("./routes/kiosk");
const PromotionCategoryRouter = require("./routes/promotioncategory");
const RebateScheduleRouter = require("./routes/rebateschedule");
const AgentRouter = require("./routes/agent");
const AgentLevelSystemRouter = require("./routes/agentlevelsystem");
const CheckInRouter = require("./routes/checkin");
const emailRouter = require("./routes/email");
const LuckySpinSettingRouter = require("./routes/luckyspinsetting");
const SEORouter = require("./routes/seo");
const PaymentGatewayRouter = require("./routes/paymentgateway");
const WhitelistIPRouter = require("./routes/whitelistip");
const KioskBalanceRouter = require("./routes/kioskbalance");
const CryptoRouter = require("./routes/cryptowallet");
const VultrRouter = require("./routes/vultr");
const AgentPTRouter = require("./routes/agentpt");
const FreeCreditRouter = require("./routes/freecredit");
const FacebookRouter = require("./routes/facebook");
const GamelistRouter = require("./routes/gamelist");

const adminListRouter = require("./routes/adminlist");
const notificationRouter = require("./routes/notification");

const slotMega888Router = require("./routes/GAMEAPI/slotmega888");
const slotMega888LoginRouter = require("./routes/GAMEAPI/slot_mega888login");
const slot918KayaRouter = require("./routes/GAMEAPI/slotkaya918");

const ALLGameFunctionRouter = require("./routes/GAMEAPI/0_GameFunction");
const ALLGameStatusRouter = require("./routes/GAMEAPI/0_GameStatus");

const { resetCheckinStreaks } = require("./routes/checkin");

const cors = require("cors");
const cookieParser = require("cookie-parser");
const cookie = require("cookie");
const Deposits = require("./models/deposit.model");
const Withdraw = require("./models/withdraw.model");
const { User } = require("./models/users.model");
const { adminUser, adminLog } = require("./models/adminuser.model");
const { Mail } = require("./models/mail.model");
const email = require("./models/email.model");
const { updateKioskBalance } = require("./services/kioskBalanceService");
const kioskbalance = require("./models/kioskbalance.model");
const UserWalletLog = require("./models/userwalletlog.model");
const BankList = require("./models/banklist.model");
const BankTransactionLog = require("./models/banktransactionlog.model");
const { myrusdtModel } = require("./models/myrusdt.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const Bonus = require("./models/bonus.model");
const app = express();
const cron = require("node-cron");
const moment = require("moment");
const ipRangeCheck = require("ip-range-check");
const server = http.createServer(app);
const axios = require("axios");
const wss = new WebSocket.Server({ noServer: true });
let connectedUsers = [];
let connectedAdmins = [];
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

server.keepAliveTimeout = 85000;
server.headersTimeout = 86000;

global.AGENT_COMMISSION_PROMOTION_ID = "6890a5e7596aa38349ade97d";
global.REBATE_PROMOTION_ID = "68909e951af19dfb128af5be";

const allowedOrigins = [
  "https://www.mysteryclub77.com",
  "capacitor://localhost",
  "ionic://localhost",
  // "http://192.168.68.59:3005",
  "file://",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3005"]
    : []),
];
app.use((req, res, next) => {
  if (process.env.PAUSE_SERVICE === "true") {
    return res.status(503).json({
      success: false,
      message: "Service is temporarily paused",
    });
  }
  next();
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("Server", "nginx");
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(slotMega888LoginRouter);

app.use(
  express.json({
    limit: "50mb",
    verify: (req, res, buf) => {
      if (req.path === "/api/kagaming") {
        return;
      }

      try {
        JSON.parse(buf);
      } catch (e) {
        const error = new Error("Invalid JSON");
        error.status = 400;
        throw error;
      }
    },
  })
);
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use((req, res, next) => {
  if (
    req.path.includes("/admin/api/seo-pages") &&
    (req.method === "POST" || req.method === "PUT")
  ) {
    return next();
  }
  const xssClean = require("xss-clean");
  return xssClean()(req, res, next);
});

const path = require("path");

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      if (origin.includes("vercel.app")) {
        return callback(null, true);
      }
      if (origin === "https://localhost" || origin === "http://localhost") {
        return callback(null, true);
      }
      if (process.env.NODE_ENV === "development") {
        return callback(null, true);
      }
      console.log(`CORS blocked request from origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minutes
  max: 10000, // 1000 Request / IP
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  skip: (req, res) => req.path === "/health",
  handler: (req, res, next, options) => {
    const clientIp = req.headers["x-forwarded-for"] || req.ip;
    const clientIpTrimmed = clientIp.split(",")[0].trim();
    const origin = req.headers.origin || "Unknown";

    console.log(
      `Global Rate Limit Exceeded - IP: ${clientIpTrimmed}, Origin: ${origin}, Path: ${
        req.path
      }, Time: ${new Date().toISOString()}`
    );
    res.status(options.statusCode).send(options.message);
  },
});

app.use(globalLimiter);

// --- SOCKET IO START ---
async function adminLogAttempt(username, fullname, clientIp, remark) {
  await adminLog.create({
    username,
    fullname,
    loginTime: new Date(),
    ip: clientIp,
    remark,
  });
}

async function updateAdminStatus(userId, status) {
  await adminUser.findByIdAndUpdate(userId, { onlineStatus: status });
}

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      if (origin.includes("vercel.app")) {
        return callback(null, true);
      }
      if (origin === "https://localhost" || origin === "http://localhost") {
        return callback(null, true);
      }
      if (process.env.NODE_ENV === "development") {
        return callback(null, true);
      }
      console.log(`Socket.IO CORS blocked request from origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const refreshToken = socket.handshake.auth.refreshToken;
  const isAdmin = socket.handshake.auth.isAdmin;
  let clientIp =
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  clientIp = clientIp.split(",")[0].trim();
  socket.clientIp = clientIp;
  if (token) {
    try {
      const secret = isAdmin
        ? process.env.JWT_ADMIN_SECRET
        : process.env.JWT_SECRET;
      const decoded = jwt.verify(token, secret);
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError" && refreshToken) {
        try {
          const refreshSecret = isAdmin
            ? process.env.ADMIN_REFRESH_TOKEN_SECRET
            : process.env.REFRESH_TOKEN_SECRET;
          const decoded = jwt.verify(refreshToken, refreshSecret);
          const user = isAdmin
            ? await adminUser.findById(decoded.userId)
            : await User.findById(decoded.userId);
          if (!user) {
            return next(new Error("User not found"));
          }
          const newToken = isAdmin
            ? await adminGenerateToken(user._id)
            : await userGenerateToken(user._id);
          socket.emit("token:refresh", { token: newToken });
          socket.userId = user._id;
          next();
        } catch (refreshError) {
          next(new Error("Authentication error"));
        }
      } else {
        next(new Error("Authentication error"));
      }
    }
  } else {
    next(new Error("Authentication error"));
  }
});

io.on("connection", async (socket) => {
  socket.isAlive = true;

  socket.on("setUserId", async (data) => {
    try {
      if (data.userId !== socket.userId) {
        // console.log(
        //   `Security Alert: User ${socket.userId} tried to set userId to ${data.userId}`
        // );
        socket.emit("error", { message: "Unauthorized" });
        socket.disconnect();
        return;
      }
      socket.userId = data.userId;
      socket.deviceId = data.deviceId;
      const user = await User.findById(socket.userId);
      if (user) {
        user.lastLogin = Date.now();
        user.lastLoginIp = socket.clientIp;
        await user.save();
      }
      const oldConnections = connectedUsers.filter(
        (user) => user.userId === socket.userId && user.socket !== socket
      );
      oldConnections.forEach((connection) => {
        if (connection.deviceId !== socket.deviceId) {
          connection.socket.emit("duplicateLogin", {
            fromDifferentDevice: true,
          });
          connection.socket.disconnect();
        }
      });
      connectedUsers = connectedUsers.filter(
        (user) => !oldConnections.includes(user)
      );
      const existingUserIndex = connectedUsers.findIndex(
        (user) => user.userId === socket.userId
      );
      if (existingUserIndex !== -1) {
        connectedUsers[existingUserIndex] = {
          userId: socket.userId,
          deviceId: socket.deviceId,
          socket,
        };
      } else {
        connectedUsers.push({
          userId: socket.userId,
          deviceId: socket.deviceId,
          socket,
        });
      }
    } catch (error) {
      console.error("Error in setUserId:", error);
    }
  });

  socket.on("setAdminId", async (data) => {
    try {
      if (data.adminId !== socket.userId) {
        // console.log(
        //   `Security Alert: Admin ${socket.userId} tried to set adminId to ${data.adminId}`
        // );
        socket.emit("error", { message: "Unauthorized" });
        socket.disconnect();
        return;
      }
      socket.adminId = data.adminId;
      await updateAdminStatus(socket.adminId, true);
      const existingAdminIndex = connectedAdmins.findIndex(
        (admin) => admin.adminId === socket.adminId
      );
      if (existingAdminIndex !== -1) {
        connectedAdmins[existingAdminIndex] = {
          adminId: socket.adminId,
          socket,
        };
      } else {
        connectedAdmins.push({
          adminId: socket.adminId,
          socket,
        });
      }
    } catch (error) {
      console.error("Error in setAdminId:", error);
    }
  });

  socket.on("getUsername", async () => {
    try {
      const userPromises = connectedUsers.map(async (connectedUser) => {
        const user = await User.findById(connectedUser.userId);
        if (user) {
          return {
            userId: user._id,
            username: user.username,
            wallet: user.wallet,
            vip: user.viplevel,
            lastlogin: user.lastLogin,
          };
        }
        return null;
      });
      const onlineUsers = await Promise.all(userPromises);
      const validOnlineUsers = onlineUsers.filter((user) => user !== null);
      socket.emit("usernameResponse", { onlineUsers: validOnlineUsers });
    } catch (error) {
      console.error("Error in getUsername:", error);
      socket.emit("error", { message: "Error fetching online users data" });
    }
  });

  socket.on("requestLatestData", async () => {
    await Promise.all([
      sendLatestDeposits(socket),
      sendLatestWithdraws(socket),
      sendLatestBonusUpdates(socket),
    ]);
  });

  socket.on("disconnect", () => {
    if (socket.adminId) {
      updateAdminStatus(socket.adminId, false);
      connectedAdmins = connectedAdmins.filter(
        (admin) => admin.socket !== socket
      );
    }
    if (socket.userId) {
      connectedUsers = connectedUsers.filter((user) => user.socket !== socket);
    }
  });
});

async function sendLatestDeposits(socket) {
  try {
    const deposits = await Deposits.find({ status: "pending" });
    socket.emit("latest deposits", deposits);
  } catch (error) {
    console.error("Error fetching latest deposits:", error);
  }
}

async function sendLatestWithdraws(socket) {
  try {
    const withdraws = await Withdraw.find({ status: "pending" });
    socket.emit("latest withdraws", withdraws);
  } catch (error) {
    console.error("Error fetching latest withdraws:", error);
  }
}

async function sendLatestBonusUpdates(socket) {
  try {
    const bonuses = await Bonus.find({ status: "pending" });
    socket.emit("latest bonuses", bonuses);
  } catch (error) {
    console.error("Error fetching latest bonuses:", error);
  }
}

function forceLogout(userId) {
  const userConnection = connectedUsers.find((user) => user.userId === userId);
  if (userConnection) {
    try {
      userConnection.socket.emit("forceLogout");
      userConnection.socket.disconnect();
      connectedUsers = connectedUsers.filter((user) => user.userId !== userId);
    } catch (error) {
      console.error(`Error during force logout for user ${userId}:`, error);
    }
  }
}

function forceLogoutAdmin(adminId) {
  const adminConnection = connectedAdmins.find(
    (admin) => admin.adminId === adminId
  );
  if (adminConnection) {
    try {
      adminConnection.socket.emit("forceLogoutAdmin");
      adminConnection.socket.disconnect();
      connectedAdmins = connectedAdmins.filter(
        (admin) => admin.adminId !== adminId
      );
      updateAdminStatus(adminId, false);
      return true;
    } catch (error) {
      console.error(`Error during force logout for admin ${adminId}:`, error);
      return false;
    }
  } else {
    console.log(`Admin ${adminId} not found in connected admins list`);
    return false;
  }
}

app.post(
  "/admin/api/force-logout-by-admin",
  authenticateAdminToken,
  async (req, res) => {
    const admin = await adminUser.findById(req.user.userId);
    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    const { userId } = req.body;
    const user = await User.findById(userId);

    forceLogout(userId);

    await adminLogAttempt(
      admin.username,
      admin.fullname,
      clientIp,
      `User: ${user.username} has been force logout. Performed by ${admin.username}`
    );

    res.json({ message: "User forced to logout" });
  }
);

app.post(
  "/admin/api/force-logout-admin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const admin = await adminUser.findById(req.user.userId);
      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();
      const { adminId } = req.body;
      if (!adminId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin ID is required",
            zh: "管理员ID是必需的",
          },
        });
      }
      const targetAdmin = await adminUser.findById(adminId);
      if (!targetAdmin) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin not found",
            zh: "未找到管理员",
          },
        });
      }
      const result = forceLogoutAdmin(adminId);

      if (admin.role !== "superadmin") {
        await adminLogAttempt(
          admin.username,
          admin.fullname,
          clientIp,
          `Admin: ${targetAdmin.username} has been force logout. Performed by ${admin.username}`
        );
      }

      if (result) {
        res.status(200).json({
          success: true,
          message: {
            en: "Admin forced to logout successfully",
            zh: "管理员已被成功强制登出",
          },
        });
      } else {
        res.status(200).json({
          success: true,
          message: {
            en: "Admin was not online or already logged out",
            zh: "管理员不在线或已经登出",
          },
        });
      }
    } catch (error) {
      console.error("Error forcing admin logout:", error);
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

app.post("/admin/api/mails", authenticateAdminToken, async (req, res) => {
  try {
    const {
      username,
      titleEN,
      titleCN,
      titleMS,
      contentEN,
      contentCN,
      contentMS,
    } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }

    sendNotificationToUser(
      user._id,
      {
        en: "You have received a new mail",
        zh: "您收到一条新邮件",
        ms: "Anda telah menerima mel baru",
      },
      {
        en: "New Mail",
        zh: "新邮件",
        ms: "Mel Baru",
      }
    );

    const mail = new Mail({
      recipientId: user._id,
      username,
      titleEN,
      titleCN,
      titleMS,
      contentEN,
      contentCN,
      contentMS,
    });

    const savedMail = await mail.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Mail sent successfully",
        zh: "邮件发送成功",
      },
      data: savedMail,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "Error sending mail",
        zh: "发送邮件时出错",
      },
    });
  }
});

mongoose.connect(process.env.MONGODB_URI);

app.get("/", (req, res) => {
  res.status(403).send({
    error: "Access Forbidden",
    message: "You do not have permission to access this resource.",
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use(express.static("public"));
app.use(usersRouter);
app.use(depositRouter);
app.use(adminUserRouter);
app.use(withdrawRouter);
app.use(banklistRouter);
app.use(userbanklistRouter);
app.use(carouselRouter);
app.use(BankTransactionLogRouter);
app.use(promotionRouter);
app.use(vipRouter);
app.use(UserWalletLogRouter);
app.use(popUpRouter);
app.use(BonusRouter);
app.use(LuckySpinRouter);
app.use(InformationRouter);
app.use(ReviewRouter);
app.use(LeaderboardRouter);
app.use(BlogRouter);
app.use(MailRouter);
app.use(AnnouncementRouter);
app.use(AnnouncementCategoryRouter);
app.use(HelpRouter);
app.use(FeedbackRouter);
app.use(PromoCodeRouter);
app.use(MemoRouter);
app.use(GeneralRouter);
app.use(KioskCategoryRouter);
app.use(Kiosk);
app.use(PromotionCategoryRouter);
app.use(RebateScheduleRouter);
app.use(AgentRouter);
app.use(AgentLevelSystemRouter);
app.use(CheckInRouter);
app.use(emailRouter);
app.use(LuckySpinSettingRouter);
app.use(SEORouter);
app.use(PaymentGatewayRouter);
app.use(WhitelistIPRouter);
app.use(KioskBalanceRouter);
app.use(CryptoRouter);
app.use(VultrRouter);
app.use(AgentPTRouter);
app.use(FreeCreditRouter);
app.use(FacebookRouter);
app.use(GamelistRouter);
app.use(AttendanceBonusRouter);
app.use(LoyaltyBonusRouter);

app.use(adminListRouter);
app.use(notificationRouter);

app.use(slotMega888Router);
app.use(slot918KayaRouter);

app.use(ALLGameFunctionRouter);
app.use(ALLGameStatusRouter);

app.use(myPromotionRouter);

app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: "请求的资源不存在",
  });
});

// app.use((err, req, res, next) => {
//   console.error("=== Global Error Caught ===");
//   console.error("Time:", new Date().toISOString());
//   console.error("Path:", req.method, req.originalUrl);
//   console.error("IP:", req.ip);
//   console.error("Error:", err.message);
//   console.error("Stack:", err.stack);
//   console.error("========================");
//   res.status(err.status || 500).json({
//     success: false,
//     message: {
//       en: "Internal server error",
//       zh: "服务器内部错误",
//       ms: "Ralat dalaman pelayan",
//     },
//   });
// });

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});

module.exports = wss;
