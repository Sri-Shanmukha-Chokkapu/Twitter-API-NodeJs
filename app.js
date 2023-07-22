const express = require("express");
const app = express();

const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

app.use(express.json());

const initializeDBServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

initializeDBServer();

//API 1
//User Registration
app.post("/register/", async (request, response) => {
  const { username, password, gender, name } = request.body;

  const getUserQuery = `SELECT username FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 5);
      const addUserQuery = `
                    INSERT INTO 
                        user(name, username, password, gender)
                    VALUES('${name}',
                            '${username}',
                            '${hashedPassword}',
                            '${gender}');`;

      try {
        responseResult = await db.run(addUserQuery);
        response.status(200);
        response.send("User created successfully");
      } catch (error) {
        console.log(error);
      }
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  }
});

//API 2
//Login User
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username: username, userId: dbUser.user_id };
      const jwtToken = jwt.sign(payload, "qwerty");
      response.send({ jwtToken });
      response.status(200);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication Token
const authenticateToken = (request, response, next) => {
  let jwtToken = null;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "qwerty", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//API 3
//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { userId } = request;
  //get following_ids from user_id
  const getFollowersIDQuery = `
        SELECT 
            following_user_id 
        FROM 
            follower 
        WHERE 
            follower_user_id = ${userId};`;

  const followersArray = await db.all(getFollowersIDQuery);
  const followingIdsArray = followersArray.map(
    (eachUser) => eachUser.following_user_id
  );

  const getTweetsQuery = `
        SELECT 
            user.username, tweet.tweet, tweet.date_time AS dateTime
        FROM 
            tweet INNER JOIN user ON tweet.user_id = user.user_id
        WHERE
            user.user_id IN (${followingIdsArray})
        ORDER BY
            tweet.date_time DESC
        LIMIT 4;`;

  const responseResult = await db.all(getTweetsQuery);
  response.send(responseResult);
});

//API 4
//Returns the list of all names of people whom the user follows
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { userId } = request;
  //get following_ids from user_id
  const getFollowersIDQuery = `
        SELECT 
            following_user_id 
        FROM 
            follower 
        WHERE 
            follower_user_id = ${userId};`;

  const followersArray = await db.all(getFollowersIDQuery);
  const followingIdsArray = followersArray.map(
    (eachUser) => eachUser.following_user_id
  );

  const getTweetsQuery = `
        SELECT 
            name
        FROM 
            user
        WHERE
            user.user_id IN (${followingIdsArray});`;

  const responseResult = await db.all(getTweetsQuery);
  response.send(responseResult);
});

//API 5
//Returns the list of all names of people who follows the user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { userId } = request;
  //get following_ids from user_id
  const getFollowersIDQuery = `
        SELECT 
            follower_user_id 
        FROM 
            follower
        WHERE 
            following_user_id = ${userId};`;

  const followersArray = await db.all(getFollowersIDQuery);
  const followerIdsArray = followersArray.map(
    (eachUser) => eachUser.follower_user_id
  );

  const getTweetsQuery = `
        SELECT 
            name
        FROM 
            user
        WHERE
            user.user_id IN (${followerIdsArray});`;

  const responseResult = await db.all(getTweetsQuery);
  response.send(responseResult);
});

//API 6
//Returns the list of all names of people who follows the user

const apiResponse = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;
  //get following_ids of the whom following
  const getFollowersIDQuery = `
        SELECT 
            following_user_id 
        FROM 
            follower
        WHERE 
            follower_user_id = ${userId};`;

  const followingArray = await db.all(getFollowersIDQuery);
  const followingIdsArray = followingArray.map(
    (eachUser) => eachUser.following_user_id
  );

  //get tweet_ids made by the users he/she is following
  const getTweetIDQuery = `
        SELECT 
            tweet_id
        FROM 
            tweet
        WHERE 
            user_id IN (${followingIdsArray});`;

  const responseResult = await db.all(getTweetIDQuery);
  const tweetIDArray = responseResult.map((eachTweet) => eachTweet.tweet_id);

  if (tweetIDArray.includes(parseInt(tweetId))) {
    const likesCountQuery = `SELECT COUNT(user_id) AS likes FROM like WHERE tweet_id = ${tweetId};`;
    const likesCount = await db.get(likesCountQuery);
    //console.log(likesCount);
    const replyCountQuery = `SELECT COUNT(user_id) AS replies FROM reply WHERE tweet_id = ${tweetId};`;
    const replyCount = await db.get(replyCountQuery);
    // console.log(replyCount);
    const tweetDataQuery = `SELECT tweet, date_time FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweetData = await db.get(tweetDataQuery);
    //console.log(tweet_tweetDate);
    response.send(apiResponse(tweetData, likesCount, replyCount));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
//If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet

const convertLikedUserNameDBObjectToResponseObject = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    //get following_ids of the whom following
    const getFollowersIDQuery = `
        SELECT 
            following_user_id 
        FROM 
            follower
        WHERE 
            follower_user_id = ${userId};`;

    const followingArray = await db.all(getFollowersIDQuery);
    const followingIdsArray = followingArray.map((eachUser) => {
      return eachUser.following_user_id;
    });

    //get tweet_ids made by the users he/she is following
    const getTweetIDQuery = `
        SELECT 
            tweet_id
        FROM 
            tweet
        WHERE 
            user_id IN (${followingIdsArray});`;

    const responseResult = await db.all(getTweetIDQuery);
    const tweetIDArray = responseResult.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (tweetIDArray.includes(parseInt(tweetId))) {
      const getTweetsQuery = `
        SELECT 
            user.username AS likes
        FROM 
            user INNER JOIN like ON user.user_id = like.user_id
        WHERE
            like.tweet_id = ${tweetId};`;

      const responseResult = await db.all(getTweetsQuery);
      const getLikedUserNames = responseResult.map((eachUser) => {
        return eachUser.likes;
      });
      response.send(
        convertLikedUserNameDBObjectToResponseObject(getLikedUserNames)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
//If the user requests a tweet of a user he is following, return the list of replies.
const convertUserNameReplyedDBObjectToResponseObject = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    //get following_ids of the whom following
    const getFollowersIDQuery = `
        SELECT 
            following_user_id 
        FROM 
            follower
        WHERE 
            follower_user_id = ${userId};`;

    const followingArray = await db.all(getFollowersIDQuery);
    const followingIdsArray = followingArray.map(
      (eachUser) => eachUser.following_user_id
    );

    //get tweet_ids made by the users he/she is following
    const getTweetIDQuery = `
        SELECT 
            tweet_id
        FROM 
            tweet
        WHERE 
            user_id IN (${followingIdsArray});`;

    const responseResult = await db.all(getTweetIDQuery);
    const tweetIDArray = responseResult.map((eachTweet) => eachTweet.tweet_id);

    if (tweetIDArray.includes(parseInt(tweetId))) {
      const getTweetsQuery = `
        SELECT 
            user.name, reply.reply
        FROM 
            user INNER JOIN reply ON user.user_id = reply.user_id
        WHERE
            reply.tweet_id = ${tweetId};`;

      const responseResult = await db.all(getTweetsQuery);
      response.send(
        convertUserNameReplyedDBObjectToResponseObject(responseResult)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
//Returns a list of all tweets of the user
/*app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  //get tweets made by user
  const getTweetQuery = `select tweet, tweet_id from tweet where user_id=${userId};`;
  const tweetDateArray = await db.all(getTweetQuery);
  const getTweetIds = tweetDateArray.map((eachId) => {
    return parseInt(eachId.tweet_id);
  });
  console.log(tweetDateArray);
  const likesCountQuery = `SELECT COUNT(user_id) AS likes FROM like WHERE tweet_id IN (${getTweetIds})
  GROUP BY
    tweet_id;`;
  const likesCount = await db.get(likesCountQuery);
  console.log(likesCount);
  const replyCountQuery = `SELECT COUNT(user_id) AS replies FROM reply WHERE tweet_id IN (${getTweetIds})
  GROUP BY
    tweet_id;`;
  const replyCount = await db.get(replyCountQuery);
  console.log(replyCount);

  response.send(apiResponse(tweetDateArray, likesCount, replyCount));
});

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { userId } = request;
  //get tweets made by user
  const getTweetIdsQuery = `select tweet_id from tweet where user_id=${userId};`;
  const getTweetIdsArray = await db.all(getTweetIdsQuery);
  const getTweetIds = getTweetIdsArray.map((eachId) => {
    return parseInt(eachId.tweet_id);
  });

  const getTweetQuery = `SELECT tweet.tweet, COUNT(like.like_id) AS likes,
  COUNT(reply.reply_id) AS replies, tweet.date_time AS dateTime FROM (tweet NATURAL JOIN like) AS T NATURAL JOIN reply WHERE tweet.tweet_id IN (${getTweetIds});`;
  const getTweetArray = await db.all(getTweetQuery);
  console.log(getTweetArray);
  response.send(getTweetArray);
});*/

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { userId } = request;
  //get tweets made by user
  const getTweetIdsQuery = `
    SELECT
    tweet.tweet,
    COUNT(DISTINCT like.like_id) AS likes,
    COUNT(DISTINCT reply.reply_id) AS replies,
    tweet.date_time
    FROM
    tweet
    LEFT JOIN like on tweet.tweet_id = like.tweet_id
    LEFT JOIN reply on tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${request.userId}
    GROUP BY tweet.tweet_id;
    `;
  const ResponseResult = await db.all(getTweetIdsQuery);
  const myTweets = ResponseResult.map((object) => {
    const { tweet, likes, replies, date_time } = object;
    return {
      tweet: tweet,
      likes: likes,
      replies: replies,
      dateTime: date_time,
    };
  });
  response.send(myTweets);
});

//API 10
//Create a tweet in the tweet table
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const { tweet } = request.body;
  const date = new Date();
  const month = date.getMonth() + 1;
  const getMonth = String(month).length === 1 ? `0${month}` : month;
  const currentDate = `${date.getFullYear()}-${getMonth}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  //console.log(currentDate);
  //const currentDate = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  console.log(currentDate);

  const addTweetQuery = `
        INSERT INTO
            tweet(tweet, user_id, date_time)
        VALUES
            ('${tweet}', ${userId}, '${currentDate}');`;

  const responseResult = await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

//API 11
//user deletes his tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;

    //get tweet_ids made by the users he/she is following
    const getTweetIDQuery = `
        SELECT 
            tweet_id
        FROM 
            tweet
        WHERE 
            user_id = ${userId};`;

    const responseResult = await db.all(getTweetIDQuery);
    const tweetIDArray = responseResult.map((eachTweet) => eachTweet.tweet_id);

    if (tweetIDArray.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `
        DELETE FROM
            tweet
        WHERE
            tweet_id = ${tweetId};`;

      const responseResult = await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
