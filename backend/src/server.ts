import "module-alias/register";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";

dotenv.config();

const MONGODB_PORT = process.env.MONGODB_PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined");
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("Mongoose connected!");
    app.listen(MONGODB_PORT, () => {
      console.log(`MongoDB server running on ${MONGODB_PORT}`);
    });
  })
  .catch(console.error);
