const checkOwnership = (Model) => async (req, res, next) => {
  try {
    const document = await Model.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    });

    if (!document) {
      return res.status(404).json({ message: 'Not found or unauthorized' });
    }

    req.document = document;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Error checking ownership' });
  }
};

module.exports = checkOwnership; 