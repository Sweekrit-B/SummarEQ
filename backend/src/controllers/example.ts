import { RequestHandler } from "express-serve-static-core";
import createHttpError from "http-errors";
import ExampleModel from "../models/example";
import { timeStamp } from "console";
import mongoose from "mongoose";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import axios from "axios";

dotenv.config();

if (!process.env.OPEN_API_KEY) {
  throw new Error("OpenAI API key not found");
}

const openai = new OpenAI({
  apiKey: process.env.OPEN_API_KEY,
});

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
  const PORT = process.env.OPEN_API_KEY;

  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `Summarize the following email: ${req.body.message.body}`,
      },
    ],
    model: "gpt-4o-mini",
  });

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
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      email: req.body.email,
      phone: req.body.phone,
      message_type: req.body.message.type,
      message_body: req.body.message.body,
      summary: completion.choices[0].message.content,
    });

    res.status(201).json(example);

    if (!process.env.POST_URL) {
      throw new Error("Post URL not found");
    }

    axios
      .post(process.env.POST_URL, example)
      .then((response) => {
        console.log("Response:", response.data);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
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
