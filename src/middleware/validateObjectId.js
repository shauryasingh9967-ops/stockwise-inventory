const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

module.exports = (req, res, next) => {
  if (!OBJECT_ID.test(req.params.id)) {
    return res.status(400).json({ message: `Invalid product id: "${req.params.id}"` });
  }
  next();
};
