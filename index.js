const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();

const port = process.env.PORT || 3100;

// MIDDLEWARE
app.use(cors());
app.use(express.json());

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

    // COLLECTIONS
    const utilitybillCollection = db.collection("utilitybills");
    const userCollection = db.collection("users");
    const myBillsCollection = db.collection("myBills");

    const lessonCollection = db.collection("lessons");
    const lessonUsersCollection = db.collection("lessonUsers");
    const lessonRequestsCollection = db.collection("lessonRequests");
    const reportedLessonsCollection = db.collection("reportedLessons");

    // VERIFY ADMIN
    const verifyAdmin = async (req, res, next) => {
      const email = req.query.email || req.body.email;
      if (!email) return res.status(401).send({ message: "Unauthorized access" });

      const user = await lessonUsersCollection.findOne({ email });
      if (!user || user.role !== "admin") return res.status(403).send({ message: "Forbidden: Admin only" });

      next();
    };

    // ===== LESSON USERS =====
    app.post("/lesson-users", async (req, res) => {
      const { email, name } = req.body;
      const exists = await lessonUsersCollection.findOne({ email });
      if (exists) return res.send({ message: "Lesson user already exists" });

      const role = email === "admin1234@gmail.com" ? "admin" : "user";
      const result = await lessonUsersCollection.insertOne({
        email,
        name,
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
      const { author, title, category, premium } = req.body;

      // Ensure user exists
      let user = await lessonUsersCollection.findOne({ email: author });
      if (!user) {
        user = await lessonUsersCollection.insertOne({
          email: author,
          name: author,
          role: "user",
          premium: false,
          createdAt: new Date(),
        });
      }

      // Insert lesson
      const lesson = {
        title,
        category,
        author,
        premium: premium || false,
        status: "pending",
        createdAt: new Date(),
      };
      const result = await lessonCollection.insertOne(lesson);

      // Insert into lessonRequests for admin approval
      await lessonRequestsCollection.insertOne({
        lessonId: result.insertedId,
        title,
        category,
        authorEmail: author,
        premium: premium || false,
        approved: false,
        createdAt: new Date(),
      });

      res.send(result);
    });

    app.get("/lessons/:id", async (req, res) => {
      const id = req.params.id;
      const result = await lessonCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get("/featured-lessons", async (req, res) => {
      const result = await lessonCollection
        .find({ premium: false, status: "approved" })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // ===== ADMIN =====
    app.get("/admin/lesson-requests", verifyAdmin, async (req, res) => {
      const result = await lessonRequestsCollection.find({ approved: false }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.patch("/admin/approve-lesson/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const lessonRequest = await lessonRequestsCollection.findOne({ _id: new ObjectId(id) });
      if (!lessonRequest) return res.status(404).send({ message: "Lesson request not found" });

      // Approve in main lessons collection
      await lessonCollection.updateOne({ _id: lessonRequest.lessonId }, { $set: { status: "approved" } });

      // Mark request as approved
      const result = await lessonRequestsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { approved: true } });
      res.send(result);
    });

    app.get("/admin/users", verifyAdmin, async (req, res) => {
      const users = await lessonUsersCollection.find().toArray();
      res.send(users);
    });

    app.patch("/admin/users/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role, premium } = req.body;
      const result = await lessonUsersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role, premium } });
      res.send(result);
    });

    app.delete("/admin/users/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await lessonUsersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get("/admin/lessons", verifyAdmin, async (req, res) => {
      const lessons = await lessonCollection.find().toArray();
      res.send(lessons);
    });

    app.delete("/admin/lessons/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await lessonCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Reported Lessons
    app.get("/reported-lessons", verifyAdmin, async (req, res) => {
      const reported = await reportedLessonsCollection.find().toArray();
      res.send(reported);
    });

    app.patch("/reported-lessons/:id", verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await reportedLessonsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { ignored: true } });
      res.send(result);
    });

    app.delete("/reported-lessons/:lessonId", verifyAdmin, async (req, res) => {
      const lessonId = req.params.lessonId;
      await lessonCollection.deleteOne({ _id: new ObjectId(lessonId) });
      await reportedLessonsCollection.deleteMany({ lessonId });
      res.send({ message: "Lesson and reports deleted successfully" });
    });

    // ===== BILL APIs (UNCHANGED) =====
    app.post("/pay-bills", async (req, res) => {
      const payBillData = req.body;
      if (!payBillData.email) return res.status(400).send({ success: false, message: "Email is required" });

      const alreadyPaid = await myBillsCollection.findOne({ billId: payBillData.billId, email: payBillData.email });
      if (alreadyPaid) return res.send({ success: false, message: "Already paid" });

      const result = await myBillsCollection.insertOne({ ...payBillData, paidAt: new Date() });
      res.send({ success: true, result });
    });

    app.get("/my-pay-bills", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.send([]);
      const result = await myBillsCollection.find({ email }).sort({ paidAt: -1 }).toArray();
      res.send(result);
    });

    app.patch("/my-pay-bills/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const result = await myBillsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
      res.send(result);
    });

    app.delete("/my-pay-bills/:id", async (req, res) => {
      const id = req.params.id;
      const result = await myBillsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get("/bills", async (req, res) => {
      const result = await utilitybillCollection.find().toArray();
      res.send(result);
    });

    app.get("/recent-bills", async (req, res) => {
      const result = await utilitybillCollection.find().sort({ created_at: -1 }).limit(6).toArray();
      res.send(result);
    });

    app.get("/all-bills", async (req, res) => {
      const result = await utilitybillCollection.find().sort({ created_at: -1 }).limit(36).toArray();
      res.send(result);
    });

    app.get("/bills/:id", async (req, res) => {
      const id = req.params.id;
      const result = await utilitybillCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post("/bills", async (req, res) => {
      const result = await utilitybillCollection.insertOne(req.body);
      res.send(result);
    });

    app.patch("/bills/:id", async (req, res) => {
      const id = req.params.id;
      const result = await utilitybillCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
      res.send(result);
    });

    app.delete("/bills/:id", async (req, res) => {
      const id = req.params.id;
      const result = await utilitybillCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
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
