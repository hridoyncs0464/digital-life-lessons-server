
const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3100;

// MIDDLEWARE
app.use(cors());
app.use(express.json());

const getDomain = (req) => {
  return req.headers.origin || process.env.SITE_DOMAIN; // Vite default port
};

// MONGODB
const uri = `mongodb+srv://${process.env.DB_US}:${process.env.DB_PASS}@cluster0.vdc0dd0.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

// ROOT
app.get("/", (req, res) => {
  res.send("Utility bill management system by Hridoy");
});

// MAIN FUNCTION
async function run() {
  try {
    await client.connect();
    const db = client.db("utilitybill_db");
    const lessonDb = client.db("lesson_database");

    // COLLECTIONS
    const utilitybillCollection = db.collection("utilitybills");
    const userCollection = db.collection("users");
    const myBillsCollection = db.collection("myBills");

    const lessonCollection = lessonDb.collection("lessons");
    const lessonUsersCollection = lessonDb.collection("lessonUsers");
    const lessonRequestsCollection = lessonDb.collection("lessonRequests");
    const reportedLessonsCollection = lessonDb.collection("reportedLessons");
    const commentsCollection = lessonDb.collection("comments");

    // VERIFY ADMIN
    const verifyAdmin = async (req, res, next) => {
      const email = req.query.email || req.body.email;

      if (!email) {
        return res.status(401).send({ message: "Email required" });
      }

      let user = await lessonUsersCollection.findOne({ email });

      // AUTO CREATE ADMIN IF NOT EXISTS
      if (!user && email === "admin1234@gmail.com") {
        await lessonUsersCollection.insertOne({
          email,
          name: "Admin",
          role: "admin",
          premium: true,
          createdAt: new Date(),
        });

        user = await lessonUsersCollection.findOne({ email });
      }

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "Admin access only" });
      }

      next();
    };

    // ===== LESSON USERS =====
    app.post("/lesson-users", async (req, res) => {
      const { email, name, photo } = req.body;

      if (!email) return res.send({});

      const exists = await lessonUsersCollection.findOne({ email });
      if (exists) return res.send(exists);

      const role = email === "rashedulislam13@niter.edu.bd" ? "admin" : "user";

      const result = await lessonUsersCollection.insertOne({
        email,
        name: name || "Unknown User",
        photo: photo || "",
        role,
        premium: false,
        createdAt: new Date(),
      });

      res.send(result);
    });

    app.get("/lesson-users/role", async (req, res) => {
      const email = req.query.email;
      const user = await lessonUsersCollection.findOne({ email });
      res.send({ role: user?.role || "user", premium: user?.premium || false });
    });

    // ===== LESSONS =====
    // Add Lesson (User → Pending Approval)
    app.post("/lessons", async (req, res) => {
      const {
        authorEmail,
        authorName,
        authorPhoto,
        title,
        category,
        shortDescription,
        emotionalTone,
        accessLevel,
        content,
      } = req.body;

      if (!authorEmail || !title) {
        return res.status(400).send({ message: "Missing fields" });
      }

      // ensure lesson user exists
      let user = await lessonUsersCollection.findOne({ email: authorEmail });

      if (!user) {
        await lessonUsersCollection.insertOne({
          email: authorEmail,
          name: authorName || "User",
          photo: authorPhoto || "",
          role: "user",
          premium: false,
          createdAt: new Date(),
        });
      }

      // MAIN LESSON (pending)
      const lesson = {
        title,
        shortDescription,
        category,
        emotionalTone,
        content,
        author: {
          email: authorEmail,
          name: authorName,
          photo: authorPhoto,
        },
        accessLevel: accessLevel || "public", // public | premium
        status: "pending",
        featured: false,
        reviewed: false,
        likes: [],
        likesCount: 0,
        favorites: [],
        favoritesCount: 0,
        createdAt: new Date(),
      };

      const lessonResult = await lessonCollection.insertOne(lesson);

      // ADMIN REQUEST
      await lessonRequestsCollection.insertOne({
        lessonId: lessonResult.insertedId,
        title,
        category,
        authorEmail,
        accessLevel: accessLevel || "public",
        approved: false,
        createdAt: new Date(),
      });

      res.send({ success: true, lessonId: lessonResult.insertedId });
    });

    app.get("/lessons/:id", async (req, res) => {
      const id = req.params.id;
      const result = await lessonCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Update a lesson
    app.patch("/lessons/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;

        const result = await lessonCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Lesson not found" });
        }

        res.send({ success: true, result });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to update lesson" });
      }
    });

    // Delete a lesson (used by My Lessons / Admin)
    app.delete("/lessons/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await lessonCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Lesson not found" });
        }

        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to delete lesson" });
      }
    });

    // FEATURED LESSONS (only approved + public)
    app.get("/featured-lessons", async (req, res) => {
      const lessons = await lessonCollection
        .find({ status: "approved", accessLevel: "public" })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();

      res.send(lessons);
    });

    // PUBLIC LESSONS API (only approved)
    app.get("/public-lessons", async (req, res) => {
      const lessons = await lessonCollection
        .find({ status: "approved" })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(lessons);
    });

    // ===== LESSON INTERACTIONS =====
    // Like / Unlike lesson
    app.patch("/lessons/:id/like", async (req, res) => {
      const lessonId = req.params.id;
      const { userId } = req.body;
      if (!userId)
        return res
          .status(400)
          .send({ success: false, message: "User ID required" });

      const lesson = await lessonCollection.findOne({
        _id: new ObjectId(lessonId),
      });
      if (!lesson)
        return res
          .status(404)
          .send({ success: false, message: "Lesson not found" });

      const likes = lesson.likes || [];
      const index = likes.indexOf(userId);

      if (index === -1) {
        likes.push(userId); // Like
      } else {
        likes.splice(index, 1); // Unlike
      }

      await lessonCollection.updateOne(
        { _id: new ObjectId(lessonId) },
        { $set: { likes, likesCount: likes.length } }
      );

      res.send({ success: true, likesCount: likes.length });
    });

    // Favorite / Unfavorite lesson
    app.patch("/lessons/:id/favorite", async (req, res) => {
      const lessonId = req.params.id;
      const { userId } = req.body;
      if (!userId)
        return res
          .status(400)
          .send({ success: false, message: "User ID required" });

      const lesson = await lessonCollection.findOne({
        _id: new ObjectId(lessonId),
      });
      if (!lesson)
        return res
          .status(404)
          .send({ success: false, message: "Lesson not found" });

      const favorites = lesson.favorites || [];
      const index = favorites.indexOf(userId);

      if (index === -1) {
        favorites.push(userId); // Add to favorites
      } else {
        favorites.splice(index, 1); // Remove from favorites
      }

      await lessonCollection.updateOne(
        { _id: new ObjectId(lessonId) },
        { $set: { favorites, favoritesCount: favorites.length } }
      );

      res.send({ success: true, favoritesCount: favorites.length });
    });

    // Report lesson
    app.post("/lessons/:id/report", async (req, res) => {
      const lessonId = req.params.id;
      const { userId, reason } = req.body;
      if (!userId || !reason)
        return res
          .status(400)
          .send({ success: false, message: "Missing fields" });

      await reportedLessonsCollection.insertOne({
        lessonId,
        reporterUserId: userId,
        reason,
        timestamp: new Date(),
        ignored: false,
      });

      res.send({ success: true, message: "Report submitted" });
    });

    // COMMENTS (unchanged)
    app.post("/lessons/:id/comments", async (req, res) => {
      const lessonId = req.params.id;
      const { userId, userEmail, userName, userPhoto, content } = req.body;

      if (!userId || !userEmail || !content?.trim()) {
        return res
          .status(400)
          .send({ success: false, message: "Missing fields" });
      }

      let cleanPhotoUrl = "";
      if (userPhoto && typeof userPhoto === "string" && userPhoto.trim()) {
        cleanPhotoUrl = userPhoto.trim();
        if (!cleanPhotoUrl.startsWith("http")) {
          cleanPhotoUrl = "";
        }
      }

      const comment = {
        lessonId,
        userId,
        userEmail,
        userName: userName?.trim() || "Anonymous",
        userPhoto: cleanPhotoUrl,
        content: content.trim(),
        createdAt: new Date(),
      };

      const result = await commentsCollection.insertOne(comment);
      res.send({
        success: true,
        comment: {
          _id: result.insertedId.toString(),
          ...comment,
        },
      });
    });

    app.get("/lessons/:id/comments", async (req, res) => {
      const lessonId = req.params.id;
      const comments = await commentsCollection
        .find({ lessonId })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();

      const formattedComments = comments.map((comment) => ({
        ...comment,
        _id: comment._id.toString(),
      }));

      res.send({ comments: formattedComments });
    });

    app.patch("/comments/:id/like", async (req, res) => {
      const commentId = req.params.id;
      const { userId } = req.body;

      if (!userId) {
        return res
          .status(400)
          .send({ success: false, message: "User ID required" });
      }

      const comment = await commentsCollection.findOne({
        _id: new ObjectId(commentId),
      });
      if (!comment) {
        return res
          .status(404)
          .send({ success: false, message: "Comment not found" });
      }

      const likes = comment.likes || [];
      const index = likes.indexOf(userId);

      if (index === -1) {
        likes.push(userId); // Like
      } else {
        likes.splice(index, 1); // Unlike
      }

      await commentsCollection.updateOne(
        { _id: new ObjectId(commentId) },
        { $set: { likes, likesCount: likes.length } }
      );

      res.send({ success: true, likesCount: likes.length });
    });

    app.delete("/comments/:id", async (req, res) => {
      const commentId = req.params.id;
      const { userId, userEmail } = req.body;

      const comment = await commentsCollection.findOne({
        _id: new ObjectId(commentId),
      });
      if (!comment) {
        return res
          .status(404)
          .send({ success: false, message: "Comment not found" });
      }

      const isAdmin = userEmail === "admin1234@gmail.com";
      if (comment.userId !== userId && !isAdmin) {
        return res
          .status(403)
          .send({ success: false, message: "Unauthorized" });
      }

      await commentsCollection.deleteOne({ _id: new ObjectId(commentId) });
      res.send({ success: true });
    });

    // Count favorites
    app.get("/stats/my-favorites-count", async (req, res) => {
      const userId = req.query.userId;
      if (!userId) return res.send({ count: 0 });

      const count = await lessonCollection.countDocuments({
        favorites: userId,
      });
      res.send({ count });
    });

    // Top Contributors - Last 7 days (unchanged)
    app.get("/top-contributors", async (req, res) => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const contributors = await lessonCollection
          .aggregate([
            {
              $match: {
                createdAt: { $gte: sevenDaysAgo },
                "author.email": { $ne: null },
              },
            },
            {
              $group: {
                _id: "$author.email",
                name: { $first: "$author.name" },
                photo: { $first: "$author.photo" },
                lessonCount: { $sum: 1 },
                latestActivity: { $max: "$createdAt" },
              },
            },
            { $sort: { lessonCount: -1, latestActivity: -1 } },
            { $limit: 12 },
            {
              $lookup: {
                from: "lessonUsers",
                localField: "_id",
                foreignField: "email",
                as: "profile",
              },
            },
            {
              $unwind: {
                path: "$profile",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                email: "$_id",
                name: { $ifNull: ["$name", "$profile.name", "Anonymous"] },
                photo: { $ifNull: ["$photo", "$profile.photo"] },
                lessonCount: 1,
                premium: { $ifNull: ["$profile.premium", false] },
              },
            },
          ])
          .toArray();

        res.json(contributors);
      } catch (error) {
        console.error("Top contributors error:", error);
        res.status(500).json([]);
      }
    });

    // Get all lessons by specific user email
    app.get("/user-lessons/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const lessons = await lessonCollection
          .find({ "author.email": email })
          .sort({ createdAt: -1 })
          .toArray();

        res.json(lessons);
      } catch (error) {
        console.error("User lessons error:", error);
        res.status(500).json([]);
      }
    });

    // Most Saved Lessons - Top 12 most favorited (unchanged)
    app.get("/most-saved-lessons", async (req, res) => {
      try {
        const mostSaved = await lessonCollection
          .aggregate([
            { $match: { status: "approved", favoritesCount: { $gt: 0 } } },
            { $sort: { favoritesCount: -1, createdAt: -1 } },
            { $limit: 12 },
            {
              $lookup: {
                from: "lessonUsers",
                localField: "author.email",
                foreignField: "email",
                as: "authorProfile",
              },
            },
            {
              $unwind: {
                path: "$authorProfile",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 1,
                title: 1,
                shortDescription: 1,
                category: 1,
                emotionalTone: 1,
                accessLevel: 1,
                favoritesCount: 1,
                likesCount: 1,
                createdAt: 1,
                author: {
                  name: {
                    $ifNull: ["$author.name", "$authorProfile.name", "Anonymous"],
                  },
                  photo: { $ifNull: ["$author.photo", "$authorProfile.photo"] },
                },
              },
            },
          ])
          .toArray();

        res.json(mostSaved);
      } catch (error) {
        console.error("Most saved lessons error:", error);
        res.status(500).json([]);
      }
    });

    // payment api (unchanged)
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { userEmail } = req.body;
        const YOUR_DOMAIN = getDomain(req);
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "bdt",
                product_data: {
                  name: "Digital Life Lessons - Premium Lifetime Access",
                  description: `Lifetime Premium access for ${userEmail}`,
                  images: [
                    "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70",
                  ],
                },
                unit_amount: 150000, // ৳1500 (in paisa)
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          customer_email: userEmail,
          success_url: `${process.env.SITE_DOMAIN}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/payment/cancel`,
          metadata: {
            userEmail: userEmail,
          },
        });

        res.json({ url: session.url });
      } catch (error) {
        console.error("Stripe error:", error);
        res.status(500).json({ error: "Failed to create checkout session" });
      }
    });

    // Get lessons created by a specific user
    app.get("/my-lessons", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.send([]);

      const lessons = await lessonCollection
        .find({ "author.email": email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(lessons);
    });

    // Get favorite lessons for a specific user
    app.get("/my-favorites", async (req, res) => {
      const userId = req.query.userId;
      if (!userId) return res.send([]);

      const lessons = await lessonCollection
        .find({ favorites: userId })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(lessons);
    });

    app.post("/users/make-premium", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) {
          return res
            .status(400)
            .send({ success: false, message: "Email required" });
        }

        const result = await lessonUsersCollection.updateOne(
          { email },
          { $set: { premium: true, premiumActivatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to update premium status" });
      }
    });

    // ===== ADMIN =====
    app.get("/admin/lesson-requests", verifyAdmin, async (req, res) => {
      const result = await lessonRequestsCollection
        .find({ approved: false })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.patch("/admin/approve-lesson/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const lessonRequest = await lessonRequestsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!lessonRequest)
        return res.status(404).send({ message: "Lesson request not found" });

      await lessonCollection.updateOne(
        { _id: lessonRequest.lessonId },
        { $set: { status: "approved" } }
      );

      const result = await lessonRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { approved: true } }
      );
      res.send(result);
    });

    app.get("/admin/users", verifyAdmin, async (req, res) => {
      const users = await lessonUsersCollection.find().toArray();
      res.send(users);
    });

    app.patch("/admin/users/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role, premium } = req.body;
      const result = await lessonUsersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role, premium } }
      );
      res.send(result);
    });

    app.delete("/admin/users/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await lessonUsersCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // UPDATED: admin lessons with requestId
    app.get("/admin/lessons", verifyAdmin, async (req, res) => {
      const lessons = await lessonCollection
        .aggregate([
          {
            $lookup: {
              from: "lessonRequests",
              localField: "_id",
              foreignField: "lessonId",
              as: "request",
            },
          },
          {
            $unwind: {
              path: "$request",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $addFields: {
              requestId: "$request._id",
            },
          },
          {
            $project: {
              request: 0,
            },
          },
        ])
        .toArray();

      res.send(lessons);
    });

    app.delete("/admin/lessons/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await lessonCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // Reported Lessons
    app.get("/reported-lessons", verifyAdmin, async (req, res) => {
      const reported = await reportedLessonsCollection.find().toArray();
      res.send(reported);
    });

    app.patch("/reported-lessons/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await reportedLessonsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { ignored: true } }
      );
      res.send(result);
    });

    app.delete("/reported-lessons/:lessonId", verifyAdmin, async (req, res) => {
      const lessonId = req.params.lessonId;
      await lessonCollection.deleteOne({ _id: new ObjectId(lessonId) });
      await reportedLessonsCollection.deleteMany({ lessonId });
      res.send({ message: "Lesson and reports deleted successfully" });
    });

    console.log("MongoDB connected successfully");
  } finally {
    // client.close(); // optional
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running by hridoy on port ${port}`);
});

