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
  const location_id = authObject.locationId;
  const contact_id = req.body.contactId;

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
      const conversationId = req.body.conversationId;
      const contactId = req.body.contactId;

      const contact = await SummaryModel.findOne({
        contactId: contactId,
      }).exec();

      if (!contact) {
        console.log("Contact not found: ", contactId);

        const messagesUrl = `https://services.leadconnectorhq.com/conversations/${conversationId}/messages`;
        const contactUrl = `https://services.leadconnectorhq.com/contacts/${contactId}`;
        const headers = {
          Authorization: "Bearer " + access_token,
          Version: "2021-04-15",
        };

        const contact_data = await axios
          .get(contactUrl, { headers: headers })
          .then((response) => {
            console.log("Received contact data: ", response.data);
            return response.data;
          })
          .catch((error) => {
            console.error("Error fetching contact data.");
            throw error;
          });

        const message_data = await axios
          .get(messagesUrl, { headers: headers })
          .then((response) => {
            console.log(
              "Received conversation messages: ",
              response.data.messages.messages
            );
            return response.data.messages.messages;
          })
          .catch((error) => {
            console.error("Error fetching conversation messages.");
            throw error;
          });

        let messageTypes: any[] = [];
        let messages = [];
        let timestamps = [];

        for (
          let i = message_data.length - 1;
          i >= Math.max(0, message_data.length - 21);
          i--
        ) {
          console.log(i);
          const message = message_data[i];
          console.log("Message: ", message);
          try {
            if (!messageTypes.includes(message.messageType)) {
              messageTypes.push(message.messageType);
            }
            const body = message.body;
            const timestamp = message.timestamp;
            messages.push(body);
            timestamps.push(timestamp);
          } catch (error) {
            console.error("Error fetching message body: ", error);
            continue;
          }
        }

        const messages_string = messages.join("; ");

        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `Summarize the following messages that are separated by a semicolon. Prioritize the first 5 messages to be part of the summary, and if there is additional context, please include it from the last 15.: ${messages_string}`,
            },
          ],
          model: "gpt-4o-mini",
        });

        const contextDetermination = await openai.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `Determine if there is any important context about the client from any of these messages. Examples include the client having children, or being away the next week, etc. Summarize all this information into one string, making sure not to dilute anything. ONLY return the summary. If there is no key information, return the EXACT STRING "None": ${messages_string}`,
            },
          ],
          model: "gpt-4o-mini",
        });

        let summaryText = completion.choices[0].message.content;
        let contextText = contextDetermination.choices[0].message.content;

        if (contextText === "None") {
          contextText = null;
        }

        const summary = await SummaryModel.create({
          firstName: contact_data.contact.firstName,
          lastName: contact_data.contact.lastName,
          email: contact_data.contact.email,
          phone: contact_data.contact.phone,
          locationId: req.body.locationId,
          contactId: req.body.contactId,
          messageTypes: messageTypes,
          messageBodies: messages,
          timestamps: timestamps,
          summary: summaryText,
          clientContext: contextText,
        });

        console.log("Received summary: ", JSON.stringify(summary));
        console.log(
          "Contact data first name: ",
          contact_data.contact.firstName
        );

        const axiosDuration = await sendPostRequest(
          access_token,
          summaryText + "\n\n" + contextText,
          location_id,
          contact_id
        );
      } else {
        console.log("Contact found: ", contact);
        const resolvedContact = contact;
        let messageTypes = resolvedContact?.messageTypes || [];
        let messageBodies = resolvedContact?.messageBodies || [];
        let timestamps: any[] = resolvedContact?.timestamps || [];
        let context = resolvedContact?.clientContext || null;

        if (!messageTypes.includes(req.body.messageType)) {
          messageTypes.push(req.body.messageType);
        }

        messageBodies.shift();
        timestamps.shift();
        messageBodies.push(req.body.body);
        timestamps.push(req.body.timestamp);

        const messagesString = messageBodies.join("; ");

        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `Summarize the following messages that are separated by a semicolon. Prioritize the first 5 messages to be part of the summary, and if there is additional context, please include it from the last 15: ${messagesString}`,
            },
          ],
          model: "gpt-4o-mini",
        });

        const contextDetermination = await openai.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `Determine if there is any important context about the client from any of the incoming message, signified by being before the set of double semicolons in your prompt ";; ". Examples include the client having children, or being away the next week, etc. If there is add it to the client context summary in the second part of your prompt (after the set of double semicolons). Return a new summary with the new information. ONLY return the summary. If there is no key information, return the EXACT STRING "None": ${req.body.body} ;; ${context}`,
            },
          ],
          model: "gpt-4o-mini",
        });

        let summaryText = completion.choices[0].message.content;
        let contextText = contextDetermination.choices[0].message.content;

        if (contextText === "None") {
          contextText = null;
        }
        console.log("Context text: ", contextText);

        const update = await SummaryModel.findOneAndUpdate(
          { contactId: contactId },
          {
            messageTypes: messageTypes,
            messageBodies: messageBodies,
            timestamps: timestamps,
            summary: summaryText,
            clientContext: contextText,
          }
        );

        const axiosDuration = await sendPostRequest(
          access_token,
          summaryText + "\n\n" + contextText,
          location_id,
          contact_id
        );

        console.log("Updated summary: ", JSON.stringify(update));
      }
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
