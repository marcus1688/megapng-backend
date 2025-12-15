const { User } = require("../models/users.model");

function normalizeFullName(fullName) {
  return fullName
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z]/g, "")
    .split("")
    .sort()
    .join("");
}

function checkNameSimilarity(name1, name2) {
  const normalized1 = normalizeFullName(name1);
  const normalized2 = normalizeFullName(name2);
  if (normalized1 === normalized2) {
    return { isDuplicate: true, similarity: "exact_anagram" };
  }
  const original1 = name1
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z]/g, "");
  const original2 = name2
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z]/g, "");
  const editDistance = getEditDistance(original1, original2);
  const lengthDiff = Math.abs(original1.length - original2.length);
  if (editDistance === 1 && lengthDiff <= 1) {
    return {
      isDuplicate: true,
      similarity: "single_character_difference",
      editDistance: editDistance,
    };
  }
  return {
    isDuplicate: false,
    similarity: "different",
    editDistance: editDistance,
  };
}

function calculateStringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(str1, str2) {
  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  return matrix[str2.length][str1.length];
}

async function checkForSimilarNames(currentUserId, currentFullName) {
  try {
    const existingUsers = await User.find(
      { _id: { $ne: currentUserId } },
      { fullname: 1, username: 1 }
    );

    for (const user of existingUsers) {
      const similarity = checkNameSimilarity(currentFullName, user.fullname);
      if (similarity.isDuplicate) {
        console.log(
          `发现相似名字: "${currentFullName}" 和 "${user.fullname}" (用户: ${user.username})`
        );
        return {
          hasSimilar: true,
          similarUser: user,
          similarity: similarity,
        };
      }
    }

    return { hasSimilar: false };
  } catch (error) {
    console.error("Error checking for similar names:", error);
    return { hasSimilar: false };
  }
}

module.exports = {
  normalizeFullName,
  checkNameSimilarity,
  checkForSimilarNames,
};
