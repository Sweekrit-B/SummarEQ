//Require express and body-parser
const express = require("express");
const bodyParser = require("body-parser");

//Initialize express and define a port
const app = express();
const PORT = 4000;

//Tell express to user body-parser's JSON parsing
app.use(bodyParser.json());

app.use(bodyParser.json());
app.post("/ghlhook", (req, res) => {
  try {
    if (req.body.type === "verification") {
      return res.json({ challenge: req.body.challenge });
    }
    console.log("Received message: ", JSON.stringify(req.body));
    res.status(200).send("Webhook successfully received");
  } catch (error) {
    console.error("Error processing webhook: ", error);
    res.status(400).send("Bad request, webhook not received.");
  }
});

//Start express on the defined port
app.listen(PORT, () => console.log("Server running on ${PORT}"));
