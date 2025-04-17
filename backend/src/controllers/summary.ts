import { RequestHandler } from "express-serve-static-core";
import SummaryModel from "../models/summary";
import InstallModel from "../models/installation";
import OAuthToken from "../models/auth";
import mongoose from "mongoose";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import axios from "axios";
import Bottleneck from "bottleneck";

dotenv.config();

//Check for the presence of an Open AI API key
if (!process.env.OPEN_API_KEY) {
  throw new Error("OpenAI API key not found");
}

//Get the OpenAI API key
const openai = new OpenAI({
  apiKey: process.env.OPEN_API_KEY,
});

//Create rate limiter
const limiter = new Bottleneck({
  minTime: 250,
  maxConcurrent: 10,
});

const getNotes = async (access_token: string, contactId?: string) => {
  console.log("Access token: ", access_token);
  const notes_url = `https://services.leadconnectorhq.com/contacts/${contactId}/notes`;
  const headers = {
    Authorization: "Bearer " + access_token,
    Version: "2021-07-28",
  };
  const response = await axios.get(notes_url, { headers: headers });
  console.log("Notes response: ", response.data);
  return response.data;
};

const createUpdateContact = async (
  access_token: string,
  notes_data: any,
  summary: string,
  contactId?: string
) => {
  console.log("Access token: ", access_token);
  if (notes_data.notes.length > 0) {
    const note_id = notes_data.notes[0].id;
    const update_url = `https://services.leadconnectorhq.com/contacts/${contactId}/notes/${note_id}`;
    const headers = {
      Authorization: "Bearer " + access_token,
      Version: "2021-07-28",
    };
    const body = {
      body: summary,
    };
    const response = await axios.put(update_url, body, {
      headers: headers,
    });
    console.log("Contact updated successfully: ", response.data);
  } else {
    const create_url = `https://services.leadconnectorhq.com/contacts/${contactId}/notes`;
    const headers = {
      Authorization: "Bearer " + access_token,
      Version: "2021-07-28",
    };
    const data = {
      body: summary,
    };
    const response = await axios.post(create_url, data, { headers: headers });
    console.log("Create contact note response: ", response.data);
  }
  console.log("Finished creating/updating contact");
};

const sendPostRequest = async (
  access_token: string,
  summary: string,
  locationId: string,
  contactId?: string
) => {
  console.log("In sendPostRequest: ", locationId);
  const axiosStartTime = Date.now();
  const search = await getNotes(access_token, contactId);
  const createUpdate = await createUpdateContact(
    access_token,
    search,
    summary,
    contactId
  );
  const axiosDuration = Date.now() - axiosStartTime;
  console.log("Axios duration: ", axiosDuration);
  return axiosDuration;
};

//Define function for sending post requests via Axios
// const sendPostRequest = async (url: string, data: any) => {
//   const axiosStartTime = Date.now();
//   let axiosDuration = 0;
//   try {
//     const response = await axios.post(url, data);
//     console.log("Response:", response.data);
//     axiosDuration = Date.now() - axiosStartTime;
//     return axiosDuration;
//   } catch (error) {
//     console.error("Error:", error);
//     throw error;
//   }
// };

//Wrap post request function in rate limiter
// const rateLimitedPostRequest = limiter.wrap(sendPostRequest);

export const getSummary: RequestHandler = async (req, res) => {
  const { id } = req.params;
  try {
    const summary = await SummaryModel.findById(id);
    if (summary === null) {
      res.status(400).send("Task not found");
    }
    res.status(200).json(summary);
  } catch (error) {
    res.status(400).send(error);
  }
};

export const createSummary: RequestHandler = async (req, res) => {
  if (
    req.body.type !== "verification" &&
    req.body.type !== "INSTALL" &&
    req.body.type !== "InboundMessage"
  ) {
    console.log("Invalid message event received:", req.body);
    res.status(400).send("Invalid message event");
    return;
  }

  const startTime = Date.now();

  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("MongoDB is not connected");
    }

    if (req.body.type === "verification") {
      res.send({ challenge: req.body.challenge });
      return;
    }

    if (req.body.type === "INSTALL") {
      const install = await InstallModel.create({
        appId: req.body.appId,
        installType: req.body.installType,
        locationId: req.body.locationId, //Stays constant throughout
        companyId: req.body.companyId,
        userId: req.body.userId,
        timestamp: req.body.timestamp,
        webhookId: req.body.webhookId,
      });

      console.log("Received installation: ", JSON.stringify(install));
      res.status(200).json(install);
    }

    if (req.body.type == "InboundMessage") {
      console.log("Received message: ", JSON.stringify(req.body));

      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "user",
            content: `Summarize the following email: ${req.body.body}`,
          },
        ],
        model: "gpt-4o-mini",
      });

      const summaryText = completion.choices[0].message.content;

      const summary = await SummaryModel.create({
        // first_name: req.body.first_name,
        // last_name: req.body.last_name,
        // email: req.body.email,
        // phone: req.body.phone,
        locationId: req.body.locationId,
        contactId: req.body.contactId,
        messageType: req.body.messageType,
        messageId: req.body.messageId,
        body: req.body.body,
        timestamp: req.body.timestamp,
        summary: summaryText,
      });
      console.log("Received summary: ", JSON.stringify(summary));
      // res.status(201).json(summary);

      if (!process.env.POST_URL_TEST) {
        throw new Error("Post URL not found");
      }

      const authObject = await OAuthToken.findOne({
        locationId: req.body.locationId,
      })
        .sort({ createdAt: -1 })
        .limit(1);

      console.log("Auth object found");

      if (!authObject) {
        res.status(400).send("No auth object found");
        console.log("No auth object found");
        return;
      }

      const access_token = authObject.accessToken;
      const authorization_code = authObject.authorizationCode;
      const locationId = authObject.locationId;
      console.log("Location ID: ", locationId);
      console.log("Created time: ", authObject.createdAt);
      // console.log("Access token: ", access_token);
      const axiosDuration = await sendPostRequest(
        access_token,
        summaryText ?? "",
        locationId,
        req.body.contactId
      );

      // const axiosTime = await rateLimitedPostRequest(
      //   process.env.POST_URL_TEST,
      //   summary
      // );

      // const totalTime = Date.now() - startTime;
      res.status(200).json({
        message: summary,
        // axiosTime: axiosTime,
        // totalTime: totalTime,
      });
    }
  } catch (error) {
    console.error("Error processing webhook: ", error);
    res.status(400).send("Bad request, webhook not received.");
  }
};

export const getAllSummaries: RequestHandler = async (req, res) => {
  try {
    const summaries = await SummaryModel.find({}).sort({ timestamp: -1 });
    res.status(200).json(summaries);
  } catch (error) {
    res.status(400).send(error);
  }
};
