const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3100;

// MIDDLEWARE
app.use(cors());
app.use(express.json());
 
const getDomain = (req) => {
  return req.headers.origin || process.env.SITE_DOMAIN ; // Vite default port
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
const lessonDb = client.db("lesson_database");    // COLLECTIONS
    const utilitybillCollection = db.collection("utilitybills");
    const userCollection = db.collection("users");
    const myBillsCollection = db.collection("myBills");
   
   const lessonCollection = lessonDb.collection("lessons");
const lessonUsersCollection = lessonDb.collection("lessonUsers");
const lessonRequestsCollection = lessonDb.collection("lessonRequests");
const reportedLessonsCollection = lessonDb.collection("reportedLessons");

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

  const role = email === "admin1234@gmail.com" ? "admin" : "user";

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

  // app.post("/lesson-users", async (req, res) => {
  //     const { email, name } = req.body;
  //     const exists = await lessonUsersCollection.findOne({ email });
  //     if (exists) return res.send({ message: "Lesson user already exists" });

  //     const role = email === "admin1234@gmail.com" ? "admin" : "user";
  //     const result = await lessonUsersCollection.insertOne({
  //       email,
  //       name,
  //       role,
  //       premium: false,
  //       createdAt: new Date(),
  //     });
  //     res.send(result);
  //   });

    app.get("/lesson-users/role", async (req, res) => {
      const email = req.query.email;
      const user = await lessonUsersCollection.findOne({ email });
      res.send({ role: user?.role || "user", premium: user?.premium || false });
    });

    // ===== LESSONS =====
   app.post("/lessons", async (req, res) => {
  const lesson = {
    ...req.body,
    status: "approved", //  directly approved
    createdAt: new Date(),
  };

  const result = await lessonCollection.insertOne(lesson);
  res.send({ success: true, result });
});

    // Add Lesson (User → Pending Approval)
// app.post("/lessons", async (req, res) => {
//   const {
//     authorEmail,
//     authorName,
//     authorPhoto,
//     title,
//     category,
//     shortDescription,
//     emotionalTone,
//     accessLevel,
//   } = req.body;

//   if (!authorEmail || !title) {
//     return res.status(400).send({ message: "Missing fields" });
//   }

//   //  ENSURE USER EXISTS
//   let user = await lessonUsersCollection.findOne({ email: authorEmail });

//   if (!user) {
//     await lessonUsersCollection.insertOne({
//       email: authorEmail,
//       name: authorName || "User",
//       photo: authorPhoto || "",
//       role: "user",
//       premium: false,
//       createdAt: new Date(),
//     });
//   }

//   // MAIN LESSON
//   const lesson = {
//     title,
//     shortDescription,
//     category,
//     emotionalTone,
//     authorEmail,
//     authorName,
//     authorPhoto,
//     accessLevel: accessLevel || "public", // public | premium
//     status: "pending",
//     createdAt: new Date(),
//   };

//   const lessonResult = await lessonCollection.insertOne(lesson);

//   // ADMIN REQUEST
//   await lessonRequestsCollection.insertOne({
//     lessonId: lessonResult.insertedId,
//     title,
//     category,
//     authorEmail,
//     accessLevel: accessLevel || "public",
//     approved: false,
//     createdAt: new Date(),
//   });

//   res.send({ success: true, lessonId: lessonResult.insertedId });
// });


    app.get("/lessons/:id", async (req, res) => {
      const id = req.params.id;
      const result = await lessonCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

   app.get("/featured-lessons", async (req, res) => {
  const lessons = await lessonCollection
    .find({ status: "approved", accessLevel: "public" })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();

  res.send(lessons);
});

//PUBLIC LESSONS API
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
  if (!userId) return res.status(400).send({ success: false, message: "User ID required" });

  const lesson = await lessonCollection.findOne({ _id: new ObjectId(lessonId) });
  if (!lesson) return res.status(404).send({ success: false, message: "Lesson not found" });

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
  if (!userId) return res.status(400).send({ success: false, message: "User ID required" });

  const lesson = await lessonCollection.findOne({ _id: new ObjectId(lessonId) });
  if (!lesson) return res.status(404).send({ success: false, message: "Lesson not found" });

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
  if (!userId || !reason) return res.status(400).send({ success: false, message: "Missing fields" });

  await reportedLessonsCollection.insertOne({
    lessonId,
    reporterUserId: userId,
    reason,
    timestamp: new Date(),
    ignored: false,
  });

  res.send({ success: true, message: "Report submitted" });
});

//payment api 
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { userEmail } = req.body;
 const YOUR_DOMAIN = getDomain(req);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'bdt',
          product_data: {
            name: 'Digital Life Lessons - Premium Lifetime Access',
            description: `Lifetime Premium access for ${userEmail}`,
            images: ['https://images.unsplash.com/photo-1529333166437-7750a6dd5a70'], 
          },
          unit_amount: 150000, // ৳1500 (in paisa)
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.SITE_DOMAIN}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/payment/cancel`,
      metadata: {
        userEmail: userEmail,
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.post("/users/make-premium", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ success: false, message: "Email required" });
    }

    const result = await lessonUsersCollection.updateOne(
      { email },
      { $set: { premium: true, premiumActivatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "User not found" });
    }

    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, message: "Failed to update premium status" });
  }
});
// app.post('/create-checkout-session', async (req, res) => {
//   try {
//     const { userEmail } = req.body;
    
//     const YOUR_DOMAIN = getDomain(req);

//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ['card'], // Like tutorial but explicit
//       line_items: [
//         {
//           price_data: { // Dynamic pricing (better than PRICE_ID)
//             currency: 'bdt',
//             product_data: {
//               name: 'Digital Life Lessons - Premium Lifetime ',
//               description: `Lifetime Premium access for ${userEmail}`,
//               images: ['https://images.unsplash.com/photo-1529333166437-7750a6dd5a70'], // Free image
//             },
//             unit_amount: 150000, // ৳1500.00 (in paisa)
//           },
//           quantity: 1,
//         },
//       ],
//       mode: 'payment',
//       success_url: `${YOUR_DOMAIN}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url: `${YOUR_DOMAIN}/payment/cancel`,
//       metadata: {
//         userEmail: userEmail, // Pass email to success page
//       },
//     });

//     // Tutorial style: Direct redirect (simpler for frontend)
//     console.log(session)
//     res.redirect(303, session.url);
//     // res.send({url: session.url})
//   } catch (error) {
//     console.error('Stripe error:', error);
//     res.status(500).send('Failed to create checkout session');
//   }
// });
// app.post('/create-checkout-session', async (req, res) => {
//   try {
//     const { userEmail } = req.body;

//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ['card'],
//       line_items: [{
//         price_data: {
//           currency: 'bdt',
//           product_data: {
//             name: 'Digital Life Lessons - Premium Lifetime Access',
//             description: `Lifetime Premium access for ${userEmail}`,
//             images: ['https://your-domain.com/premium-badge.png'], // Add your logo
//           },
//           unit_amount: 150000, // ৳1500 (in paisa)
//         },
//         quantity: 1,
//       }],
//       mode: 'payment',
//       success_url: `${req.headers.origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url: `${req.headers.origin}/payment/cancel`,
//       metadata: {
//         userEmail: userEmail,
//       },
//     });

//     res.json({ url: session.url });
//   } catch (error) {
//     console.error('Stripe error:', error);
//     res.status(500).json({ error: 'Failed to create checkout session' });
//   }
// });


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
