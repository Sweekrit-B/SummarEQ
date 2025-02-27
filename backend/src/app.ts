//Require express and body-parser
import express from "express";
import bodyParser from "body-parser";
import exampleRoutes from "./routes/example";

//Initialize express and define a port
const app = express();
const PORT = 4100;

//Tell express to user body-parser's JSON parsing
app.use(bodyParser.json());
app.use("/ghlhook", exampleRoutes);

app.get("/", (req, res) => {
  res.send("Server is running!");
});

//Start express on the defined port
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
export default app;
