import "module-alias/register";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../src/app";

dotenv.config();

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined");
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("Mongoose connected!");
    app.listen(PORT, () => {
      console.log(`MongoDB server running on ${PORT}`);
    });
  })
  .catch(console.error);
