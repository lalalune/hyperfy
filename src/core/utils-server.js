import crypto from 'crypto'
import jwt from 'jsonwebtoken'

/**
 *
 * Hash File
 *
 * takes a file and generates a sha256 unique hash.
 * carefully does this the same way as the client function.
 *
 */

export async function hashFile(file) {
  const hash = crypto.createHash('sha256')
  hash.update(file)
  return hash.digest('hex')
}

/**
 * JSON Web Tokens
 */

const jwtSecret = process.env.JWT_SECRET

export function createJWT(data) {
  return new Promise((resolve, reject) => {
    jwt.sign(data, jwtSecret, (err, token) => {
      if (err) return reject(err)
      resolve(token)
    })
  })
}

export function readJWT(token) {
  return new Promise((resolve, reject) => {
    if (!jwtSecret) {
        return reject(new Error("JWT_SECRET environment variable is not set."));
    }
    jwt.verify(token, jwtSecret, (err, data) => {
      if (err) {
        return reject(new Error(`JWT verification failed: ${err.message}`));
      }
      resolve(data);
    });
  });
}
