const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();



const port = process.env.PORT || 3100;
console.log(process.env);
   

//middleWare
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_US}:${process.env.DB_PASS}@cluster0.vdc0dd0.mongodb.net/?appName=Cluster0`;

   

// Creat a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Utility bill managment system by Hridoy");
});  

async function run() {
  try {
    // await client.connect();

    // creating database -0
    const db = client.db("utilitybill_db");
    const utilitybillCollection = db.collection("utilitybills");
    const userCollection = db.collection("users");
    const myBillsCollection = db.collection("myBills");
          const lessonCollection = db.collection("lessons");

          
          // API: Add Lesson (from user form)
          app.post("/lessons", async (req, res) => {
        const lesson = {
     ...req.body,
     status: "pending",     // admin approval needed
    createdAt: new Date(),
   };

  const result = await lessonCollection.insertOne(lesson);
  res.send(result);
});
  
//API: Get Featured Lessons (Home Page) 
app.get("/featured-lessons", async (req, res) => {
  const result = await lessonCollection
    .find({
      premium: false,
      status: "approved",
    })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();

  res.send(result);
});


//API: Lesson Details Page
app.get("/lessons/:id", async (req, res) => {
  const id = req.params.id;
  const result = await lessonCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

      //API: Admin Approves Lesson (Dashboard)
          app.patch("/lessons/approve/:id", async (req, res) => {
  const id = req.params.id;

  const result = await lessonCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "approved" } }
  );

  res.send(result);
});






    // Pay Bill API (After Submit)-6
    app.post("/pay-bills", async (req, res) => {
      const payBillData = req.body;

      if (!payBillData.email) {
        return res.status(400).send({
          success: false,
          message: "Email is required to pay a bill",
        });
      }

      const alreadyPaid = await myBillsCollection.findOne({
        billId: payBillData.billId,
        email: payBillData.email,
      });
                                               
      if (alreadyPaid) {
        return res.send({
          success: false,
          message: "This bill has already been paid.",
        });
      }

      const result = await myBillsCollection.insertOne({
        ...payBillData,
        paidAt: new Date(),
      });

      res.send({
        success: true,
        message: "Bill paid successfully!",
        result,
      });
    });

    //API for New Users insert-4
    app.post("/users", async (req, res) => {
      const newUsers = req.body;

      //cheaking is the user is already exists in the database or not

      const email = req.body.email;
      const query = { email: email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        res.send({
          massage: "user already exists. do not need to insert again",
        });
      } else {
        const result = await userCollection.insertOne(newUsers);
        res.send(result);
      }
    });
 
    //get my pay bills by the user email -7
    app.get("/my-pay-bills", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([]);
      }

      const result = await myBillsCollection
        .find({ email })
        .sort({ paidAt: -1 })
        .toArray();
      res.send(result);
    });

    //update  my pay bill
    app.patch("/my-pay-bills/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          amount: updateData.amount,
          address: updateData.address,
          phone: updateData.phone,
          date: updateData.date,
        },
      };

      const result = await myBillsCollection.updateOne(query, updateDoc);
      res.send(result);
    });



    //delete my pay bills
    app.delete("/my-pay-bills/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await myBillsCollection.deleteOne(query);
      res.send(result);
    });

    //get or to Fine all -1
    app.get("/bills", async (req, res) => {
      //    const projectfileds = {
      //     title:1,
      //     category:1,
      //     location:1,

      //    }
      //       const cursor = utilitybillCollection.find().sort({amount : 1}).limit(6).project(projectfileds);
      const cursor = utilitybillCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    //recent bills API
    app.get("/recent-bills", async (req, res) => {
      const cursor = utilitybillCollection
        .find()
        .sort({ created_at: -1 })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });




    //all bills  Api-5
    app.get("/all-bills", async (req, res) => {
      const cursor = utilitybillCollection
        .find()
        .sort({ created_at: -1 })
        .limit(36);
      const result = await cursor.toArray();
      res.send(result);
    });
                         
                                                    
    //get or to find a specific -2
                       
    //get or to find a specific -2
    app.get("/bills/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await utilitybillCollection.findOne(query);
      res.send(result);
    });
                         
    //API for insert-3
    app.post("/bills", async (req, res) => {
      const newBills = req.body;
      const result = await utilitybillCollection.insertOne(newBills);
      res.send(result);
    });
                   




    //API for Update or patch-4
    app.patch("/bills/:id", async (req, res) => {
      const id = req.params.id;
      const updatedBill = req.body;

      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updatedBill.name,
          amount: updatedBill.amount,
        },
      };

      const result = await utilitybillCollection.updateOne(query, update);
      res.send(result);
    });

    //API  for delete-5
    app.delete("/bills/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await utilitybillCollection.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your Utility bill managment system . Hridoy successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(
    `Yes,Utility bill managment system   by Hridoy listening on port ${port}`
  );
});
