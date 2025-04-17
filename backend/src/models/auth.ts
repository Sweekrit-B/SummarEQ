import { InferSchemaType, Schema, model, Types } from "mongoose";

const authSchema = new Schema({
  userId: { type: String, required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  locationId: { type: String, required: true },
  authorizationCode: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

type Auth = InferSchemaType<typeof authSchema>;
export default model<Auth>("Auth", authSchema);
