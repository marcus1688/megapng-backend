const express = require("express");
const router = express.Router();
const Feedback = require("../models/feedback.model");
const { adminUser, adminLog } = require("../models/adminuser.model");
const { User } = require("../models/users.model");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
async function uploadFileToS3(file) {
  const fileKey = `feedbacks/${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

// Get user's feedbacks
router.get("/api/user/feedbacks", authenticateToken, async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });
    res.json({ success: true, data: feedbacks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// User Create Feedback
router.post(
  "/api/feedbacks",
  authenticateToken,
  upload.array("images", 5),
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found, please contact customer service",
            zh: "找不到用户，请联系客服",
            zh_hk: "搵唔到用戶，請聯繫客服",
            ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
            id: "Pengguna tidak ditemukan, silakan hubungi layanan pelanggan",
          },
        });
      }
      if (!req.body.problemType || !req.body.description) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Problem type and description are required",
            zh: "问题类型和描述是必填项",
            zh_hk: "問題類型同描述係必填項",
            ms: "Jenis masalah dan keterangan diperlukan",
            id: "Jenis masalah dan deskripsi wajib diisi",
          },
        });
      }
      const imageUrls = [];
      if (req.files) {
        for (const file of req.files) {
          const url = await uploadFileToS3(file);
          imageUrls.push(url);
        }
      }
      const feedback = new Feedback({
        userId: userId,
        username: user.username,
        problemType: req.body.problemType,
        description: req.body.description,
        images: imageUrls,
      });
      await feedback.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Feedback submitted successfully",
          zh: "反馈提交成功",
          zh_hk: "意見反饋提交成功",
          ms: "Maklum balas berjaya dihantar",
          id: "Umpan balik berhasil dikirim",
        },
        data: feedback,
      });
    } catch (error) {
      console.error("Feedback submission error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to submit feedback",
          zh: "反馈提交失败",
          zh_hk: "意見反饋提交失敗",
          ms: "Gagal menghantar maklum balas",
          id: "Gagal mengirim umpan balik",
        },
      });
    }
  }
);

// Admin Get All Feedbacks
router.get(
  "/admin/api/feedbacksadmin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const feedbacks = await Feedback.find().sort({ createdAt: -1 });
      res.json({ success: true, data: feedbacks });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Feedback Status
router.patch(
  "/admin/api/feedbacks/:id/status",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const feedback = await Feedback.findByIdAndUpdate(
        req.params.id,
        { status: req.body.status },
        { new: true }
      );
      if (!feedback) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Feedback not found",
            zh: "未找到反馈",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Feedback status updated successfully",
          zh: "反馈状态更新成功",
        },
        data: feedback,
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

// Admin Delete Feedback
router.delete(
  "/admin/api/feedbacks/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const feedback = await Feedback.findById(req.params.id);
      if (!feedback) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Feedback not found",
            zh: "未找到反馈",
          },
        });
      }
      if (feedback.images?.length) {
        for (const imageUrl of feedback.images) {
          const key = `feedbacks/${imageUrl.split("/").pop()}`;
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: key,
            })
          );
        }
      }
      await Feedback.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Feedback deleted successfully",
          zh: "反馈删除成功",
        },
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

router.get("/api/feedbacks/active", authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const feedbacks = await Feedback.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const totalCount = await Feedback.countDocuments({
      userId: req.user.userId,
    });
    const totalPages = Math.ceil(totalCount / limit);

    const tickets = feedbacks.map((feedback) => ({
      id: feedback._id,
      problemType: feedback.problemType,
      description: feedback.description,
      images: feedback.images || [],
      status: feedback.status ? "resolved" : "pending",
      conversation: feedback.conversation || [],
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      tickets,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      message: {
        en: "Support tickets retrieved successfully.",
        zh: "工单已成功获取。",
        zh_hk: "工單已成功獲取。",
        ms: "Tiket sokongan berjaya diperoleh.",
        id: "Tiket dukungan berhasil diperoleh.",
      },
    });
  } catch (error) {
    console.error("Error fetching user tickets:", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "An unexpected error occurred while retrieving tickets. Please try again later.",
        zh: "检索工单时发生意外错误，请稍后再试。",
        zh_hk: "檢索工單時發生意外錯誤，請稍後再試。",
        ms: "Ralat tidak dijangka berlaku semasa mendapatkan tiket. Sila cuba lagi kemudian.",
        id: "Terjadi kesalahan tak terduga saat mengambil tiket. Silakan coba lagi nanti.",
      },
    });
  }
});

router.post(
  "/api/feedbacks/:id/message",
  authenticateToken,
  upload.array("images", 5),
  async (req, res) => {
    try {
      const { message } = req.body;
      const feedbackId = req.params.id;

      if (!message || message.trim() === "") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Message content cannot be empty.",
            zh: "消息内容不能为空。",
            zh_hk: "訊息內容不可為空。",
            ms: "Kandungan mesej tidak boleh dibiarkan kosong.",
            id: "Isi pesan tidak boleh kosong.",
          },
        });
      }

      const feedback = await Feedback.findOne(
        { _id: feedbackId, userId: req.user.userId },
        { username: 1, conversation: 1 }
      );

      if (!feedback) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Feedback ticket not found.",
            zh: "未找到对应的反馈工单。",
            zh_hk: "找不到相應的回饋工單。",
            ms: "Tiket maklum balas tidak ditemui.",
            id: "Tiket umpan balik tidak ditemukan.",
          },
        });
      }

      let attachmentUrls = [];

      if (req.files) {
        for (const file of req.files) {
          const uploadResult = await uploadFileToS3(file);
          attachmentUrls.push(uploadResult);
        }
      }
      const newMessage = {
        sender: "customer",
        senderName: feedback.username,
        message: message.trim(),
        attachments: attachmentUrls || [],
      };

      feedback.conversation.push(newMessage);
      await feedback.save();

      return res.status(200).json({
        success: true,
        data: {
          message: newMessage,
          conversationLength: feedback.conversation.length,
        },
        message: {
          en: "Message sent successfully.",
          zh: "消息发送成功。",
          zh_hk: "訊息已成功發送。",
          ms: "Mesej berjaya dihantar.",
          id: "Pesan berhasil dikirim.",
        },
      });
    } catch (error) {
      console.error("Error sending message:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "An unexpected server error occurred. Please try again later.",
          zh: "发生服务器意外错误，请稍后再试。",
          zh_hk: "伺服器出咗啲問題，老闆稍後再試下",
          ms: "Ralat pelayan yang tidak dijangka berlaku. Sila cuba lagi kemudian.",
          id: "Terjadi kesalahan server yang tidak terduga. Silakan coba lagi nanti.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/feedbacks/:id/reply",
  authenticateAdminToken,
  upload.array("images", 5),
  async (req, res) => {
    try {
      const { message } = req.body;
      const feedbackId = req.params.id;

      if (!message || message.trim() === "") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Message content cannot be empty.",
            zh: "消息内容不能为空。",
            zh_hk: "訊息內容不可為空。",
            ms: "Kandungan mesej tidak boleh dibiarkan kosong.",
            id: "Isi pesan tidak boleh kosong.",
          },
        });
      }

      const feedback = await Feedback.findOne(
        { _id: feedbackId },
        { username: 1, conversation: 1 }
      );

      if (!feedback) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Feedback ticket not found.",
            zh: "未找到对应的反馈工单。",
            zh_hk: "找不到相應的回饋工單。",
            ms: "Tiket maklum balas tidak ditemui.",
            id: "Tiket umpan balik tidak ditemukan.",
          },
        });
      }

      let attachmentUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const uploadResult = await uploadFileToS3(file);
          attachmentUrls.push(uploadResult);
        }
      }

      const adminId = req.user.userId;
      const admin = await adminUser.findById(adminId).select("username").lean();
      const senderName = admin?.username || "Admin";

      const newMessage = {
        sender: "agent",
        senderName,
        message: message.trim(),
        attachments: attachmentUrls,
      };

      feedback.conversation.push(newMessage);
      await feedback.save();

      return res.status(200).json({
        success: true,
        data: {
          message: newMessage,
          conversationLength: feedback.conversation.length,
        },
        message: {
          en: "Reply sent successfully.",
          zh: "回复已成功发送。",
          zh_hk: "回覆已成功發送。",
          ms: "Balasan berjaya dihantar.",
          id: "Balasan berhasil dikirim.",
        },
      });
    } catch (error) {
      console.error("Error sending agent reply:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "An unexpected server error occurred. Please try again later.",
          zh: "发生服务器意外错误，请稍后再试。",
          zh_hk: "伺服器出咗啲問題，老闆稍後再試下",
          ms: "Ralat pelayan yang tidak dijangka berlaku. Sila cuba lagi kemudian.",
          id: "Terjadi kesalahan server yang tidak terduga. Silakan coba lagi nanti.",
        },
      });
    }
  }
);

router.get(
  "/admin/api/feedbacks/:id/viewchat",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const feedbackId = req.params.id;

      const feedback = await Feedback.findById(feedbackId);

      if (!feedback) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Feedback ticket not found.",
            zh: "未找到对应的反馈工单。",
            zh_hk: "找不到相應的回饋工單。",
            ms: "Tiket maklum balas tidak ditemui.",
            id: "Tiket umpan balik tidak ditemukan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          feedback,
        },
        message: {
          en: "Feedback chat retrieved successfully.",
          zh: "反馈聊天已成功获取。",
          zh_hk: "回饋聊天已成功獲取。",
          ms: "Sembang maklum balas berjaya diperoleh.",
          id: "Obrolan umpan balik berhasil diperoleh.",
        },
      });
    } catch (error) {
      console.error("Error fetching feedbacks:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "An unexpected server error occurred. Please try again later.",
          zh: "发生服务器意外错误，请稍后再试。",
          zh_hk: "伺服器出咗啲問題，老闆稍後再試下",
          ms: "Ralat pelayan yang tidak dijangka berlaku. Sila cuba lagi kemudian.",
          id: "Terjadi kesalahan server yang tidak terduga. Silakan coba lagi nanti.",
        },
      });
    }
  }
);

router.get(
  "/api/feedbacks/agent-streaks",
  authenticateToken,
  async (req, res) => {
    try {
      const tickets = await Feedback.find(
        { userId: req.user.userId },
        {
          conversation: { $slice: -10 },
          lastSeenByUser: 1,
          createdAt: 1,
          updatedAt: 1,
          problemType: 1,
          status: 1,
        }
      ).lean();
      let totalStreak = 0;

      for (const ticket of tickets) {
        const messages = ticket.conversation || [];
        const lastSeen = ticket.lastSeenByUser;

        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg?.sender !== "agent") break;

          if (lastSeen && new Date(msg.createdAt) <= new Date(lastSeen)) break;

          totalStreak++;
        }
      }

      return res.status(200).json({
        success: true,
        data: { totalStreak },
        message: {
          en: "Agent reply streaks retrieved successfully.",
          zh: "客服连续回复次数已成功获取。",
          zh_hk: "客服連續回覆次數已成功獲取。",
          ms: "Rentetan balasan ejen berjaya diperoleh.",
          id: "Rangkaian balasan agen berhasil diperoleh.",
        },
      });
    } catch (error) {
      console.error("Error computing agent streaks:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "An unexpected server error occurred. Please try again later.",
          zh: "发生服务器意外错误，请稍后再试。",
          zh_hk: "伺服器出咗啲問題，老闆稍後再試下",
          ms: "Ralat pelayan yang tidak dijangka berlaku. Sila cuba lagi kemudian.",
          id: "Terjadi kesalahan server yang tidak terduga. Silakan coba lagi nanti.",
        },
      });
    }
  }
);

router.patch(
  "/api/feedbacks/:id/mark-seen",
  authenticateToken,
  async (req, res) => {
    try {
      const feedbackId = req.params.id;

      const feedback = await Feedback.findOneAndUpdate(
        {
          _id: feedbackId,
          userId: req.user.userId,
        },
        {
          lastSeenByUser: new Date(),
        },
        { new: true }
      );

      if (!feedback) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Feedback not found",
            zh: "未找到反馈",
            zh_hk: "搵唔到反饋",
            ms: "Maklum balas tidak ditemui",
            id: "Umpan balik tidak ditemukan",
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          lastSeenByUser: feedback.lastSeenByUser,
        },
        message: {
          en: "Messages marked as seen",
          zh: "消息已标记为已读",
          zh_hk: "訊息已經標記咗做已讀",
          ms: "Mesej ditandakan sebagai telah dibaca",
          id: "Pesan ditandai sebagai telah dibaca",
        },
      });
    } catch (error) {
      console.error("Error marking messages as seen:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
          zh_hk: "伺服器內部出咗問題",
          ms: "Ralat dalaman pelayan",
          id: "Kesalahan server internal",
        },
      });
    }
  }
);

module.exports = router;
