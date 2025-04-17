import { InferSchemaType, Schema, model, Types } from "mongoose";

const summarySchema = new Schema({
  // first_name: { type: String, required: false },
  // last_name: { type: String, required: false },
  // email: { type: String, required: false },
  // phone: { type: String, required: false },
  locationId: { type: String, required: true },
  contactId: { type: String, required: true },
  messageType: { type: String, required: false },
  messageId: { type: String, required: false },
  body: { type: String, required: false },
  timestamp: { type: Date, default: Date.now, required: false },
  summary: { type: String, required: false },
});

type Summary = InferSchemaType<typeof summarySchema>;
export default model<Summary>("Summary", summarySchema);
