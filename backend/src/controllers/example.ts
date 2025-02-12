import { RequestHandler } from "express-serve-static-core";
import createHttpError from "http-errors";
import ExampleModel from "../models/example";
import { timeStamp } from "console";
import mongoose from "mongoose";

export const getExample: RequestHandler = async (req, res) => {
  const { id } = req.params;
  try {
    const example = await ExampleModel.findById(id);
    if (example === null) {
      res.status(400).send("Task not found");
    }
    res.status(200).json(example);
  } catch (error) {
    res.status(400).send(error);
  }
};

export const createExample: RequestHandler = async (req, res) => {
  const { type, email, subject, timestamp } = req.body;
  try {
    if (req.body.type === "verification") {
      res.send({ challenge: req.body.challenge });
      return;
    }
    console.log("Received message: ", JSON.stringify(req.body));

    if (mongoose.connection.readyState !== 1) {
      throw new Error("MongoDB is not connected");
    }

    const example = await ExampleModel.create({
      type: type,
      email: email,
      subject: subject,
      timestamp: timestamp,
    });

    res.status(201).json(example);
  } catch (error) {
    console.error("Error processing webhook: ", error);
    res.status(400).send("Bad request, webhook not received.");
  }
};

export const getAllExamples: RequestHandler = async (req, res) => {
  try {
    const examples = await ExampleModel.find({}).sort({ timestamp: -1 });
    res.status(200).json(examples);
  } catch (error) {
    res.status(400).send(error);
  }
};
