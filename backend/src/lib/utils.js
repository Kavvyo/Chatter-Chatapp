import jwt from 'jsonwebtoken';

export const genrateToken = (userId, res) => {
    const token = jwt.sign({userId}, process.env.JWT_SECRET,{expiresIn: "7d"});

    res.cookie("jwt",token, {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7days in miliseconds
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV !== "development",

    })

    return token;
}