import { RequestHandler } from "express-serve-static-core";
import SummaryModel from "../models/summary";
import InstallModel from "../models/installation";
import OAuthToken from "../models/auth";
import { refreshToken } from "./auth";
import mongoose from "mongoose";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import axios from "axios";
import Bottleneck from "bottleneck";
import qs from "qs";

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

//Check if current auth token is valid
const updateToken = async (locationId: string) => {
  // Retrieve authObject
  console.log("---");
  console.log("Searching for auth token INSIDE updateToken function...");
  const authObject = await OAuthToken.findOne({ locationId }).sort({
    createdAt: -1,
  });

  // Check if authObject exists
  if (!authObject) {
    console.log(
      "There is no auth object with this locationId. Install the app!"
    );
    return;
  } else {
    console.log("Found auth token!");
  }

  // Figure out if the current token is expired
  console.log("Checking token expiration...");
  const isExpired =
    Date.now() - new Date(authObject.createdAt).getTime() > 60 * 60 * 1000;

  // Conditional if the current token is expired
  if (isExpired) {
    console.log("Token is expired!");

    // Retrieve the refresh token
    console.log("Searching for refresh token...");
    const refresh_token = authObject.refreshToken;

    // Check to make sure the refresh token exits
    if (!refresh_token) {
      console.log("Refresh token not provided!");
      return;
    } else {
      console.log("Found the refresh token!");
    }

    // If the refresh token exists...
    try {
      console.log("Retrieiving a new access token using the refresh token...");
      // Retrieve a new token using axios
      const token = await axios.post(
        "https://services.leadconnectorhq.com/oauth/token",
        qs.stringify({
          grant_type: "refresh_token",
          client_id: process.env.GHL_CLIENT_ID,
          client_secret: process.env.GHL_CLIENT_SECRET,
          refresh_token: refresh_token,
        })
      );
      console.log("Done retrieving the new token!");

      // Update the OAuth object
      console.log("Updating the OAuth object...");
      await authObject.updateOne({
        accessToken: token.data.access_token,
        refreshToken: token.data.refresh_token,
      });
      console.log("Done updating the OAuth object!");
      console.log("---");
    } catch (error) {
      // Catch and return any errors
      console.error("Error refreshing token", error);
    }
  } else {
    console.log("Token is not expired! Continuing.");
    console.log("---");
  }
};

//Get all notes associated with a certain contact
const getNotes = async (access_token: string, contactId?: string) => {
  console.log("Inside getNotes function...");

  //Set the post URL and headers
  const notes_url = `https://services.leadconnectorhq.com/contacts/${contactId}/notes`;
  const headers = {
    Authorization: "Bearer " + access_token,
    Version: "2021-07-28",
  };

  // Retrieve the response
  console.log("Getting notes...");
  const response = await axios.get(notes_url, { headers: headers });
  console.log("Notes response: ", response.data);

  return response.data;
};

//Create and update the contact notes
const createUpdateContact = async (
  access_token: string,
  notes_data: any,
  summary: string,
  contactId?: string
) => {
  console.log("Inside createUpdateContact...");

  // Check if there are already notes about this user
  if (notes_data.notes.length > 0) {
    console.log("Found notes about the user...");

    // Retrieve the first note in the list
    const note_id = notes_data.notes[0].id;

    // Set an update URL, headers, and body
    const update_url = `https://services.leadconnectorhq.com/contacts/${contactId}/notes/${note_id}`;
    const headers = {
      Authorization: "Bearer " + access_token,
      Version: "2021-07-28",
    };
    const body = {
      body: summary,
    };

    console.log("Updating contact...");
    const response = await axios.put(update_url, body, {
      headers: headers,
    });
    console.log("Contact updated successfully: ", response.data);
  } else {
    console.log("Did not find any notes about the user...");

    // Set the update URL, headers, and body
    const create_url = `https://services.leadconnectorhq.com/contacts/${contactId}/notes`;
    const headers = {
      Authorization: "Bearer " + access_token,
      Version: "2021-07-28",
    };
    const data = {
      body: summary,
    };

    console.log("Updating contact...");
    const response = await axios.post(create_url, data, { headers: headers });
    console.log("Create contact note response: ", response.data);
  }
  console.log("Finished creating/updating contact");
  console.log("---");
};

//Send a post request
const sendPostRequest = async (
  access_token: string,
  summary: string,
  locationId: string,
  contactId?: string
) => {
  console.log("---");
  console.log("Inside sendPostRequest...");

  // Setting variables
  const axiosStartTime = Date.now();

  // Search for notes to update
  console.log("Searching for current notes...");
  const search = await getNotes(access_token, contactId);
  console.log("Finished searching for contacts!");

  // Update thecontact
  console.log("Updating contact...");
  const createUpdate = await createUpdateContact(
    access_token,
    search,
    summary,
    contactId
  );
  console.log("Finished updating contacts!");

  const axiosDuration = Date.now() - axiosStartTime;
  console.log("Axios duration: ", axiosDuration);
  return axiosDuration;
};

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
  // Verify that all the request information is correct
  console.log("Verifying request body information...");
  if (
    req.body.type !== "verification" &&
    req.body.type !== "INSTALL" &&
    req.body.type !== "InboundMessage"
  ) {
    console.log("Invalid message event received:", req.body);
    res.status(400).send("Invalid message event");
    return;
  }
  console.log("Verified request body information!");

  // Set start time for downstream analysis
  const startTime = Date.now();
  console.log("Set start time: ", startTime);

  // Find the auth object
  console.log("Searching for auth object based on locationId...");
  const authObject = await OAuthToken.findOne({
    locationId: req.body.locationId,
  })
    .sort({ createdAt: -1 })
    .limit(1);

  // Debugging to check if auth object was found
  if (!authObject) {
    res.status(400).send("No auth object found!");
    console.log("No auth object found!");
    return;
  } else {
    console.log("Found auth object!");
  }

  // Make sure that access token is up-to-date
  console.log("Updating access token...");
  updateToken(authObject.locationId);
  console.log("Finished updating access token!");

  // Setting varaibles for easy access
  const access_token = authObject.accessToken;
  const location_id = authObject.locationId;
  const contact_id = req.body.contactId;

  try {
    // Check if external database is connected
    if (mongoose.connection.readyState !== 1) {
      throw new Error("MongoDB is not connected");
    }

    // Provide verification if necessary
    if (req.body.type === "verification") {
      console.log("Checking for verification...");
      res.send({ challenge: req.body.challenge });
      console.log("Sent verification!");
      return;
    }

    if (req.body.type === "INSTALL") {
      console.log("Installing application...");
      const install = await InstallModel.create({
        appId: req.body.appId,
        installType: req.body.installType,
        locationId: req.body.locationId, //Stays constant throughout
        companyId: req.body.companyId,
        userId: req.body.userId,
        timestamp: req.body.timestamp,
        webhookId: req.body.webhookId,
      });

      console.log("Completed installation!");
      res.status(200).json(install);
    }

    if (
      req.body.type == "InboundMessage" ||
      req.body.type == "OutboundMessage"
    ) {
      // Indicate that the message has been received
      console.log("Received message: ", JSON.stringify(req.body));

      // Set variables to make it convenient for devs
      const conversationId = req.body.conversationId;
      const contactId = req.body.contactId;

      // Find the user's contact
      console.log("Searching for contact...");
      const contact = await SummaryModel.findOne({
        contactId: contactId,
      }).exec();

      if (!contact) {
        console.log("Contact not found!");

        // Set variables for the axios post requests
        const messagesUrl = `https://services.leadconnectorhq.com/conversations/${conversationId}/messages`;
        const contactUrl = `https://services.leadconnectorhq.com/contacts/${contactId}`;

        // Set headers
        const headers = {
          Authorization: "Bearer " + access_token,
          Version: "2021-04-15",
        };

        // Retrieve data regarding the contact
        console.log("Retrieving contact data...");
        const contact_data = await axios
          .get(contactUrl, { headers: headers })
          .then((response) => {
            console.log("Received contact data!");
            return response.data;
          })
          .catch((error) => {
            console.error("Error fetching contact data!");
            throw error;
          });

        // Retrieve message data
        console.log("Retrieving messaging data...");
        const message_data = await axios
          .get(messagesUrl, { headers: headers })
          .then((response) => {
            console.log("Received conversation messages!");
            return response.data.messages.messages;
          })
          .catch((error) => {
            console.error("Error fetching conversation messages.");
            throw error;
          });

        // Create arrays to store message types, message, and timestamps
        let messageTypes: any[] = [];
        let messages = [];
        let timestamps = [];

        // Iterate through sliding window of messages
        console.log("Iterating through sliding window of messages...");
        for (
          let i = message_data.length - 1;
          i >= Math.max(0, message_data.length - 21);
          i--
        ) {
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

        // Combine all the messages into one string
        const messages_string = messages.join("; ");

        // Summary prompting
        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `Summarize the following messages that are separated by a semicolon. Prioritize the first 5 messages to be part of the summary, and if there is additional context, please include it from the last 15. As context, these messages are retrieved from a client-facing messaging service. Therefore, you should not just create a generic summary. Give me a quick summary of the whole conversation, an bulleted list of upcoming meetings, and a second bulleted list of action items that need to be taken. If any of these are not relevant to the conversation, do not include them. Also, I am giving you the current date - use this as your point of reference for anything time-based : ${messages_string}, ${Date.now()}`,
            },
          ],
          model: "gpt-4o-mini",
        });

        // Context prompting
        const contextDetermination = await openai.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `Determine if there is any important context about the client from any of these messages. Examples include the client having children, or being away the next week, etc. Summarize all this information into one string, making sure not to dilute anything. ONLY return this context. If there is no key information, return the EXACT STRING "None". Also, I am giving you the current date - use this as your point of reference for anything time-based :  ${messages_string}, ${Date.now()}`,
            },
          ],
          model: "gpt-4o-mini",
        });

        // Run the OpenAI prompts
        console.log("Running prompt logic...");
        let summaryText = completion.choices[0].message.content;
        let contextText = contextDetermination.choices[0].message.content;
        console.log("Finished prompting!");

        // Filter our irrelevant context text.
        if (contextText === "None") {
          contextText = "There is no user context as of now.";
        }

        // Creat a contact object
        console.log("Creating summary/contact object...");
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

        // Send the post request
        console.log("Sending post request...");
        const axiosDuration = await sendPostRequest(
          access_token,
          summaryText + "\n\n" + contextText,
          location_id,
          contact_id
        );
        console.log("Sent post request!");
      } else {
        console.log("Contact found!");

        // Set existing varaibles
        const resolvedContact = contact;
        let messageTypes = resolvedContact?.messageTypes || [];
        let messageBodies = resolvedContact?.messageBodies || [];
        let timestamps: any[] = resolvedContact?.timestamps || [];
        let context = resolvedContact?.clientContext || null;

        // Update the message types if need be
        if (!messageTypes.includes(req.body.messageType)) {
          console.log("Updating message types...");
          messageTypes.push(req.body.messageType);
          console.log("Finished updating!");
        }

        // Push new messages
        console.log("Updating arrays...");
        messageBodies.shift();
        timestamps.shift();
        messageBodies.push(req.body.body);
        timestamps.push(req.body.timestamp);
        console.log("Finished updating arrays!");

        const messagesString = messageBodies.join("; ");

        // Define the OpenAI models
        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `Summarize the following messages that are separated by a semicolon. Prioritize the first 5 messages to be part of the summary, and if there is additional context, please include it from the last 15. As context, these messages are retrieved from a client-facing messaging service. Therefore, you should not just create a generic summary. Give me a quick summary of the whole conversation, an bulleted list of upcoming meetings, and a second bulleted list of action items that need to be taken. If any of these are not relevant to the conversation, do not include them. Also, I am giving you the current date - use this as your point of reference for anything time-based : ${messagesString}, ${Date.now()}`,
            },
          ],
          model: "gpt-4o-mini",
        });

        const contextDetermination = await openai.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `Determine if there is any important context about the client from any of the incoming message, signified by being before the set of double semicolons in your prompt ";; ". Examples include the client having children, or being away the next week, etc. If there is add it to the client context summary in the second part of your prompt (after the set of double semicolons). Return a new summary with the new information. ONLY return the summary. If there is no key information, return the EXACT STRING "None". Also, I am giving you the current date - use this as your point of reference for anything time-based. Note that this time logic should be used to update past context as well. If the past context is time sensitive and the current date invalidates that, also return "None" :  ${messagesString}, ${Date.now()}`,
            },
          ],
          model: "gpt-4o-mini",
        });

        // Running the prompt logic
        console.log("Running prompt logic...");
        let summaryText = completion.choices[0].message.content;
        let contextText = contextDetermination.choices[0].message.content;
        console.log("Finished prompting!");

        // User context logic
        if (contextText === "None") {
          contextText = "There is no user context as of now.";
        }

        // Updating the user object
        console.log("Updating the user/contact object...");
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
        console.log("Finished updating user/contact object!");

        // Send the post request
        console.log("Sending the post request...");
        const axiosDuration = await sendPostRequest(
          access_token,
          summaryText + "\n\n" + contextText,
          location_id,
          contact_id
        );
        console.log("Received post request!");

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
