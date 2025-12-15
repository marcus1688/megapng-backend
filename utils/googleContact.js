const { google } = require("googleapis");

const getCredentials = () => {
  if (!process.env.GOOGLE_CREDENTIALS) {
    throw new Error("GOOGLE_CREDENTIALS environment variable not set");
  }
  return JSON.parse(process.env.GOOGLE_CREDENTIALS);
};

const getTokens = () => {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("GOOGLE_REFRESH_TOKEN environment variable not set");
  }
  return {
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  };
};

const getAuthClient = async () => {
  const credentials = getCredentials();
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const https = require("https");
  const agent = new https.Agent({ family: 4 });

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
  oauth2Client.transporter.defaults = {
    ...oauth2Client.transporter.defaults,
    agent,
  };

  const tokens = getTokens();
  oauth2Client.setCredentials(tokens);

  oauth2Client.on("tokens", (newTokens) => {
    console.log(
      "Google OAuth token refreshed:",
      newTokens.access_token?.substring(0, 20) + "..."
    );
  });

  return oauth2Client;
};

const addContactToGoogle = async (
  userid,
  fullname,
  phoneNumbers,
  notes = ""
) => {
  try {
    const auth = await getAuthClient();
    const people = google.people({ version: "v1", auth });

    const phoneNumbersFormatted = phoneNumbers.map((phone, index) => ({
      value: phone.startsWith("+") ? phone : `+${phone}`,
      type: index === 0 ? "mobile" : "other",
    }));

    const formattedName = `${userid}✅${fullname}`;

    const requestBody = {
      names: [
        {
          givenName: formattedName,
          displayName: formattedName,
        },
      ],
      phoneNumbers: phoneNumbersFormatted,
    };

    if (notes) {
      requestBody.biographies = [
        {
          value: notes,
          contentType: "TEXT_PLAIN",
        },
      ];
    }

    const response = await people.people.createContact({ requestBody });
    console.log(
      "Google Contact created:",
      formattedName,
      response.data.resourceName
    );

    return {
      success: true,
      resourceName: response.data.resourceName,
    };
  } catch (error) {
    console.error("Error creating Google contact:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = { addContactToGoogle };
