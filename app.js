const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        console.log("Success");
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;

  const dbUser = await database.get(selectUserQuery);

  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
          
        );`;
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const dbResponse = await database.run(createUserQuery);
      response.status(200);
      response.send(`User created successfully`);
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const { limit = 4, order = "DESC", order_by = "date_time" } = request.query;

  const tweetuserQuery = `SELECT username  , tweet ,date_time AS dateTime  FROM tweet INNER JOIN user ON 
        user.user_id = tweet.user_id INNER JOIN  follower ON 
     user.user_id = follower.following_user_id 
    WHERE user.user_id IN (
         SELECT follower.following_user_id FROM user  INNER JOIN follower 
        ON user.user_id = follower.follower_user_id
        WHERE username = '${username}'
        GROUP BY follower.following_user_id 
    )
    GROUP BY tweet.tweet_id
    ORDER BY ${order_by} ${order} 
    LIMIT ${limit} ; `;

  const getTweet = await database.all(tweetuserQuery);
  response.send(getTweet);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const followuserQuery = `SELECT name FROM user  INNER JOIN follower 
    ON user.user_id = follower.following_user_id
    WHERE user.user_id IN  (
        SELECT follower.following_user_id FROM user  INNER JOIN follower 
    ON user.user_id = follower.follower_user_id
    WHERE username = '${username}'
    GROUP BY follower.following_user_id 
    )
    GROUP BY user.user_id
    
        ;`;
  const getFollowing = await database.all(followuserQuery);
  response.send(getFollowing);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const followeruserQuery = `SELECT name FROM user  INNER JOIN follower 
    ON user.user_id = follower.follower_user_id
    WHERE user.user_id IN  (
        SELECT follower.follower_user_id FROM user  INNER JOIN follower 
    ON user.user_id = follower.following_user_id
    WHERE username = '${username}'
    GROUP BY follower.follower_user_id 
    )
    GROUP BY user.user_id;
     `;

  const getFollower = await database.all(followeruserQuery);
  response.send(getFollower);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { tweet } = request.query;
  const { username } = request;

  const requestQuery = `SELECT tweet FROM tweet INNER JOIN user ON tweet.user_id = user.user_id 
                            INNER JOIN follower ON user.user_id = follower.following_user_id
                        WHERE tweet_id = ${tweetId} 
                        AND tweet.user_id = (
                            SELECT follower.following_user_id FROM user  INNER JOIN follower 
                            ON user.user_id = follower.follower_user_id
                            WHERE username = '${username}'
                            GROUP BY follower.following_user_id 
                        )
                        
                        
                          ;`;
  const checkTweet = await database.all(requestQuery);
  console.log(checkTweet);
  /*                           
  if (tweet === checkTweet.tweet) {
    // console.log(tweet === checkTweet.tweet);
    const finalQuery = `
      ;`;
    const getFinalQuery = await database.get(finalQuery);
    response.send({
      tweet: getFinalQuery["tweet"],
      likes: getFinalQuery["COUNT(like.like_id)"],
      reply: getFinalQuery["COUNT(reply.reply_id)"],
      dateTime: getFinalQuery["date_time"],
    });
  } else {
    // response.status(401);
    // response.send("Invalid Request");
    response.send(checkTweet);
  }
  */
});

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { tweet } = request.query;

    const requestQuery = `SELECT tweet.tweet FROM tweet INNER JOIN user ON tweet.user_id 
                        = user.user_id INNER JOIN follower ON user.user_id = follower.following_user_id
                        WHERE tweet.tweet_id = ${tweetId}
                          ;`;
    const checkTweet = await database.get(requestQuery);

    if (tweet === checkTweet.tweet) {
      // console.log(tweet === checkTweet.tweet);
      /*const likeTweetQuery = `SELECT user.username FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
      INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN  like ON tweet.tweet_id = like.tweet_id
      WHERE tweet.tweet_id = ${tweetId}  GROUP BY user.username;`;
      const usernameTweet = await database.get(likeTweetQuery);
      response.send(usernameTweet);
      */

      const userQuery = `SELECT username FROM user INNER JOIN tweet ON user.user_id = tweet.user_id 
      INNER JOIN like ON tweet.tweet_id = like.tweet_id WHERE tweet.tweet_id = ${tweetId};
      GROUP BY user.user_id`;
      const useRquery = await database.all(userQuery);
      let userList = [];
      for (let item of useRquery) {
        userList.push(item.username);
      }

      response.send({ likes: userList });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/reply",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { tweet } = request.query;

    const requestQuery = `SELECT tweet.tweet FROM tweet INNER JOIN user ON tweet.user_id 
                        = user.user_id INNER JOIN follower ON user.user_id = follower.following_user_id
                        WHERE tweet_id = ${tweetId}
                          ;`;
    const checkTweet = await database.get(requestQuery);

    if (tweet === checkTweet.tweet) {
      const listOfreplyQuery = `SELECT user.name,reply.reply FROM user INNER JOIN tweet ON user.user_id = tweet.user_id 
      INNER JOIN reply ON tweet.tweet_id = reply.tweet_id  WHERE tweet.tweet_id = ${tweetId} GROUP BY user.user_id  `;
      const replyGet = await database.all(listOfreplyQuery);
      let replyList = [];
      for (let reply of replyGet) {
        replyList.push(reply);
      }
      response.send({ reply: replyList });
    } else {
      response.status(401);
      response.send("Invalid Request");
      // response.send(checkTweet);
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getAlluserTweetQuery = `SELECT tweet.tweet,COUNT(like.like_id),COUNT(reply.reply_id),tweet.date_time
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON tweet.tweet_id = like.tweet_id
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id  
    WHERE  user.username = '${username}' GROUP BY tweet.tweet;`;
  const getAlluserTweet = await database.all(getAlluserTweetQuery);
  response.send(
    getAlluserTweet.map((each) => {
      return {
        tweet: each.tweet,
        likes: each["COUNT(like.like_id)"],
        replies: each["COUNT(reply.reply_id)"],
        dateTime: each.date_time,
      };
    })
  );
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const postTweetQuery = `INSERT INTO tweet(tweet)  VALUES ('${tweet}')`;
  console.log(postTweetQuery);
  const postTweet = await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { tweet } = request.query;
    // console.log(tweet);
    const deleteQuery = `SELECT tweet FROM tweet INNER JOIN user ON user.user_id 
                        = tweet.user_id INNER JOIN follower ON user.user_id = follower.following_user_id
                        WHERE tweet_id = ${tweetId} `;

    console.log(deleteQuery, "1");
    const checkTweet = await database.all(deleteQuery);
    console.log(checkTweet);

    if (tweet === checkTweet.tweet) {
      console.log("1");
      const deleteQuery = `DELETE FROM tweet 
         WHERE tweet_id = ${tweetId};`;
      const deleteTweet = await database.run(deleteQuery);
      response.send("Tweet removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
