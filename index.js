const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config()
const app = express()
const port = process.env.PORT | 5000
let jwt = require('jsonwebtoken');
const stripe = require("stripe")('sk_test_51NgMf2SJZsIhUwm5TWFi9g4SrqXCK64lm6uRTaywDhymkuX5Umy9WaPjs5DqZwFSo6h8KMzLhXKBwRpzJKUfUpdF00wrja3qm3');

// middleWare
const corsOptions ={
    origin:'*', 
    credentials:true,
    optionSuccessStatus:200,
 }
app.use(cors({
    origin : [
        'https://parcelpulce.web.app',
        'https://parcelpulce.firebaseapp.com'
    ],
    credentials : true
}))
app.use(express.json())
// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.60qibw3.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const userCollection = client.db('parcelPulse').collection('user')
        const bookParcelCollection = client.db('parcelPulse').collection('bookParcel')
        const reviewsCollection = client.db('parcelPulse').collection('reviews')

        // Verify Token
        const verifyToken = (req, res, next) => {
            if (!req?.headers?.authorization) {
                return res.status(401).send({ message: 'Forbidden access' })
            }
            const token = req?.headers?.authorization?.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Forbidden access' })
                }
                req.decoded = decoded
                next()
            })
        }
        // VerIfy Admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()

        }
        // JWT
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ token })
        })


        app.get('/average-review', async (req, res) => {
            try {
                const id = req.query.deliveryMenId;
                const query = { deliveryMenId: id };
                const options = {
                    projection: { rating: 1, _id: 0 }
                };
                const reviews = await reviewsCollection.find(query, options).toArray();

                const totalRating = reviews.reduce((sum, review) => sum + parseInt(review.rating), 0);
                const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

                res.send({ averageRating });
            } catch (error) {
                console.error(error);
                res.status(500).send('Internal Server Error');
            }
        });



        // Get all DeliveryMan
        app.get('/delivery-man', async (req, res) => {

            const query = [
                { $match: { role: 'DeliveryMen' } },
                { $sort: { parcelsDelivered: -1 } }
            ];
            const deliveryMen = await userCollection.aggregate(query).toArray();
            res.send(deliveryMen)
        })
        app.get('/all-delivery-man', async (req, res) => {
            const query = { role: 'DeliveryMen' }
            const deliveryMen = await userCollection.find(query).toArray();
            res.send(deliveryMen)
        })
        app.get('/all-user', async (req, res) => {
            const query = { role: 'User' }
            const deliveryMen = await userCollection.find(query).toArray();
            res.send(deliveryMen)
        })
        app.post('/user', async (req, res) => {
            const user = req.body
            const query = { email: user?.email }
            const isExist = await userCollection.findOne(query)
            if (isExist) {
                return res.send({ message: 'user Already Exist' })
            }
            const result = await userCollection.insertOne(user)
            res.send(result)
        })

        app.get('/user/usertype/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const userType = await userCollection.findOne(query)
            let Admin = false
            let User = false
            let DeliveryMen = false
            if (userType) {
                Admin = userType?.role === 'Admin'
                User = userType?.role === 'User'
                DeliveryMen = userType?.role === 'DeliveryMen'
                return res.send({ Admin, User, DeliveryMen })
            }
        })

        app.post('/book-parcel', async (req, res) => {
            const data = req.body
            const result = await bookParcelCollection.insertOne(data)
            res.send(result)
        })
        app.get('/book-parcel',verifyToken, async (req, res) => {
            const email = req?.query.email
            if (email !== req.decoded.email) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const query = { email: email }
            const result = await bookParcelCollection.find(query).toArray()
            res.send(result)
        })
        // admiN Book parcel statistic
        app.get('/book-parcel-statistic', async (req, res) => {
            try {
                const options = {
                    projection: { bookingDate: 1, _id: 0 }
                };

                const result = await bookParcelCollection.find({}, options).toArray();
                const bookingDates = result.map(item => item.bookingDate.slice(0, 10));

                // Create an object to store arrays of dates
                const dateGroups = {};

                // Group dates into separate arrays
                bookingDates.forEach(date => {
                    if (!dateGroups[date]) {
                        dateGroups[date] = [date];
                    } else {
                        dateGroups[date].push(date);
                    }
                });

                // Convert the object values to an array
                const groupedDatesArray = Object.entries(dateGroups).map(([date, datesArray]) => ({
                    date,
                    booked: datesArray.length
                }));

                res.send(groupedDatesArray);
            } catch (error) {
                console.error('Error in /book-parcel-statistic route:', error);
                res.status(500).send('Internal Server Error');
            }
        });
        app.patch('/deliveryCount', async (req, res) => {
            try {
                const email = req.query.email;
                const query = { email: email };
                const options = { upsert: true };

                // Find the user
                const user = await userCollection.findOne(query);

                // If the user exists, update the parcelsDelivered field
                if (user) {
                    const parcelCount = user.parcelsDelivered + 1;
                    const doc = {
                        $set: {
                            parcelsDelivered: parcelCount
                        }
                    };

                    // Update the user document
                    const update = await userCollection.updateOne(query, doc, options);

                    res.send({ updated: true, modifiedCount: update.modifiedCount });
                } else {
                    // Handle the case where the user is not found
                    res.status(404).send({ updated: false, message: 'User not found.' });
                }
            } catch (error) {
                console.error(error);
                res.status(500).send('Internal Server Error');
            }
        });


        app.get('/book-parcel/update/:id', async (req, res) => {
            const id = req?.params?.id
            const query = { _id: new ObjectId(id) }
            const result = await bookParcelCollection.findOne(query)
            res.send(result)
        })
        // book parcel Count
        app.get('/book-parcel-count', async (req, res) => {
            const email = req?.query.email
            const query = { email: email }
            const result = (await bookParcelCollection.find(query).toArray())
            res.send(result)
        })
        // Update Booking
        app.patch('/percelUpdate/:id', async (req, res) => {
            try {
                const id = req.params.id
                const data = req.body
                const query = { _id: new ObjectId(id) }
                const options = { upsert: true };
                const doc = {
                    $set: {
                        name: data?.name,
                        email: data?.email,
                        number: data?.number,
                        type: data?.type,
                        weight: data?.weight,
                        receiverName: data?.receiverName,
                        receiverNumber: data?.receiverNumber,
                        address: data?.address,
                        requestedDeliveryDate: data?.requestedDeliveryDate,
                        latitude: data?.latitude,
                        longitude: data?.longitude,
                        price: data?.price,
                        status: data?.status,
                        bookingDate: data?.bookingDate,
                    }
                }
                const result = await bookParcelCollection.updateOne(query, doc, options)
                res.send(result)
            } catch (error) {
                console.log(error);
            }
        })
        // Update Status
        app.patch('/update-status/:id', async (req, res) => {
            try {
                const id = req.params.id
                const data = req.body
              
                const query = { _id: new ObjectId(id) }
                const options = { upsert: true };
                const doc = {
                    $set: {
                        status: data?.status
                    }
                }
                const result = await bookParcelCollection.updateOne(query, doc, options)
                res.send(result)
            } catch (error) {
                console.log(error);
            }
        })
        // Update User
        app.patch('/update-user/:id', async (req, res) => {
            try {
                const id = req.params.id
                const data = req.body
                const query = { _id: new ObjectId(id) }
                const options = { upsert: true };
                const doc = {
                    $set: {
                        role: data?.role
                    }
                }
                const result = await userCollection.updateOne(query, doc, options)
                res.send(result)
            } catch (error) {
                console.log(error);
            }
        })
        // manage delivery
        app.patch('/manage-booking/:id', async (req, res) => {
            try {
                const id = req.params.id
                const data = req.body
                const query = { _id: new ObjectId(id) }
                const options = { upsert: true };
                const doc = {
                    $set: {
                        status: data?.status,
                        deliveryMenId: data?.deliveryMenId,
                        approximateDeliveryDate: data?.approximateDeliveryDate
                    }
                }
                const result = await bookParcelCollection.updateOne(query, doc, options)
                res.send(result)
            } catch (error) {
                console.log(error);
            }
        })

        // Sort Using Status
        app.get('/sort-status', async (req, res) => {
            try {
                const statusName = req.query;
                if (!statusName || !statusName.status || !statusName.email) {
                    const result = await bookParcelCollection.find().toArray();
                    return res.send(result);
                }

                const query = [
                    {
                        $match: {
                            $and: [
                                { status: statusName.status },
                                { email: statusName.email }
                            ]
                        }
                    },
                    { $sort: { status: 1 } }
                ];

                const deliveryMen = await bookParcelCollection.aggregate(query).toArray();
                res.send(deliveryMen);
            } catch (error) {
                console.error('Error:', error);
                res.status(500).send('Internal Server Error');
            }
        });

        app.get('/my-parcel', async (req, res) => {
            const email = req?.query.email
            const query = { email: email }
            const result = await bookParcelCollection.find(query).toArray()
            return res.send(result)
        })
        app.get('/all-parcel', async (req, res) => {
            const { startDate, endDate } = req?.query
            try {
                if (!startDate || !endDate) {
                    const rangeResult = await bookParcelCollection.find().toArray();
                    res.send(rangeResult);
                    // console.log('without query',rangeResult);
                } else {
                    const data = await bookParcelCollection.find({
                        requestedDeliveryDate: {
                            $gte: startDate,
                            $lte: endDate,
                        },
                    }).toArray();
                    // console.log('with query',data);
                    res.send(data)
                }

            } catch (error) {
                console.error('Error:', error);
                res.status(500).send('Internal Server Error');
            }
        });
        // my delivery list
        app.get('/my-delivery-list', async (req, res) => {
            const user = req.query.user
            const query = { email: user }
            const findUser = await userCollection.findOne(query)
            const userId = findUser._id.toString();
            const query2 = { deliveryMenId: userId }
            const findDelivery = await bookParcelCollection.find(query2).toArray()
            res.send(findDelivery)

        })
        // Add Review
        app.post('/add-reviews', async (req, res) => {
            const data = req.body
            const result = await reviewsCollection.insertOne(data)
            
            res.send(result)
        })
        // Get My Reviews
        app.get('/my-reviews',verifyToken, async (req, res) => {
            const email = req.query.email
            if (email !== req.decoded.email) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const query = { email: email }
            const findUser = await userCollection.findOne(query)
            const id = findUser?._id?.toString();
            const query2 = { deliveryMenId: id }
            const myReviews = await reviewsCollection.find(query2).toArray()
            res.send(myReviews)
        })


        // Payment
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body
            const amount = parseInt(price * 100)

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'inr',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.get('/home-stats', async (req, res) => {
            const totalParcel = await bookParcelCollection.estimatedDocumentCount()
            const query = { status: 'delivered' }
            const totalDelivered = (await bookParcelCollection.find(query).toArray()).length
            const totalUser = await userCollection.estimatedDocumentCount()
            res.send({ totalParcel, totalDelivered, totalUser })
        })


        app.get('/users/:email', async (req, res) => {
            const email = req.params?.email
            if (email !== req.decoded.email) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const result = await userCollection.find().toArray()
            res.send(result)
        })
        app.delete('/users/:id', async (req, res) => {
            const user = req.params.id
            const query = { _id: new ObjectId(user) }
            const result = await userCollection.deleteOne(query)
            res.send(result)
        })

        app.get('/user/admin/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let admin = false
            if (user) {
                admin = user?.role === 'Admin'
            }
            res.send(admin)
        })
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Parcel Is Going')
})
app.listen(port, console.log('Parcel boss is running'))