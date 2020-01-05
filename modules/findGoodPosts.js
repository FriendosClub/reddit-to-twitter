/* eslint-disable no-console */

const findGoodPost = (posts) => new Promise((resolve, reject) => {
  const minScore = parseInt(process.env.MIN_POST_KARMA, 10);

  const goodPosts = [];

  posts.forEach((post) => {
    if (post.stickied || post.is_self || !post.url) return;

    if (post.is_video) {
      // TODO: Implement downloading video, maybe re-encoding with ffmpeg?
      console.log(` > ${post.id} is a video, skipping for now...`);
      return;
    }

    if (post.score < minScore) {
      console.log(` > Skipping post ${post.id} (${post.score} < ${minScore})`);
      return;
    }

    // At this point, we've filtered the junk from our request and can query the db
    goodPosts.push(post);
  });

  if (goodPosts.length < 1) {
    reject(new Error('No suitable post found.'));
  } else {
    resolve(goodPosts);
  }
});

module.exports = findGoodPost;
