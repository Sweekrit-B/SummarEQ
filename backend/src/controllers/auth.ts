import { RequestHandler } from "express";
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import axios from "axios";
import qs from "qs";
import OAuthToken from "../models/auth"; // Import the OAuthToken model

dotenv.config();

export const redirectAuth: RequestHandler = async (req, res) => {
  const scopes =
    "contacts.readonly contacts.write conversations/message.readonly conversations/message.write"; // Define app scopes
  const url = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?response_type=code&redirect_uri=${process.env.GHL_REDIRECT_URI}&client_id=${process.env.GHL_CLIENT_ID}&scope=${scopes}`;
  // Construct URL for authorization request
  res.redirect(url); //Redirect user to authorization URL
};

export const callbackAuth: RequestHandler = async (req, res) => {
  const code = req.query.code; // Get authorization code from query parameters
  if (!code) {
    console.log("Authorization code not provided"); //Handle missing code
    res.redirect("/auth/redirect"); // Redirect to redirect page
    return;
  }
  try {
    const code = req.query.code;
    const tokenRes = await axios.post(
      "https://services.leadconnectorhq.com/oauth/token",
      qs.stringify({
        grant_type: "authorization_code",
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        code: code,
        redirect_uri: process.env.GHL_REDIRECT_URI,
      })
    ); // Send POST request to get tokens

    const { access_token, refresh_token, locationId } = tokenRes.data; // Extract access and refresh tokens from response
    // console.log("Access token: ", access_token); // Log access token
    // console.log("Refresh token: ", refresh_token); // Log refresh token
    // console.log("Location ID: ", locationId); // Log location ID

    const token = await OAuthToken.create({
      userId: locationId, // Use location ID as user ID
      accessToken: access_token,
      refreshToken: refresh_token,
      locationId: locationId,
      authorizationCode: code,
    }); // Create new OAuthToken instance with tokens and location ID

    console.log("Received Auth: ", JSON.stringify(token));

    res.redirect(`/auth/success?location_id=${locationId}`); // Redirect to success page with location ID
  } catch (error) {
    console.error("OAuth error", error);
    res.status(500).send("Error during OAuth process"); // Handle errors
  }
};

export const refreshToken: RequestHandler = async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    res.status(400).send("Refresh token not provided");
    return;
  }
  try {
    const token = await axios.post(
      "https://services.leadconnectorhq.com/oauth/token",
      qs.stringify({
        grant_type: "refresh_token",
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        refresh_token: refresh_token,
      })
    );
    console.log("Token response: ", token.data);
    await OAuthToken.findOneAndUpdate(
      { refreshToken: refresh_token },
      {
        accessToken: token.data.access_token,
        refreshToken: token.data.refresh_token,
      },
      { new: false, upsert: true }
    );
  } catch (error) {
    console.error("Error refreshing token", error);
    res.status(500).send("Error refreshing token");
  }
};

export const successAuth: RequestHandler = async (req, res) => {
  const locationId = req.query.location_id; // Get location ID from query parameters
  if (!locationId) {
    res.status(400).send("Location ID not provided"); // Handle missing location ID
  }
  res.send("Authorization successful!"); // Send success message to user
};
