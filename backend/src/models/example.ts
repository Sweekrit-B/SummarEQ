import { InferSchemaType, Schema, model, Types } from "mongoose";

const exampleSchema = new Schema({
  type: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String, required: true },
  timestamp: { type: String, required: true },
  body: { type: String, required: false },
  summary: { type: String, required: false },
});

type Example = InferSchemaType<typeof exampleSchema>;
export default model<Example>("Example", exampleSchema);
