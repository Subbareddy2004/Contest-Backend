const Problem = require('../models/Problem');

exports.createProblem = async (req, res) => {
  try {
    const problem = new Problem({
      ...req.body,
      createdBy: req.user.id
    });
    await problem.save();
    res.status(201).json(problem);
  } catch (error) {
    console.error('Error creating problem:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getFacultyProblems = async (req, res) => {
  try {
    const problems = await Problem.find({ createdBy: req.user.id });
    res.json(problems);
  } catch (error) {
    console.error('Error fetching faculty problems:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAllProblems = async (req, res) => {
  try {
    const problems = await Problem.find({});
    res.json(problems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProblemById = async (req, res) => {
  try {
    const problem = await Problem.findById(req.params.id);
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    res.json(problem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProblem = async (req, res) => {
  try {
    const problem = await Problem.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      req.body,
      { new: true }
    );
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    res.json(problem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProblem = async (req, res) => {
  try {
    const problem = await Problem.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.id
    });
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
