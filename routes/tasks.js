var Task = require("../models/task");
var User = require("../models/user")

module.exports = function (router) {

    var tasksRoute = router.route("/tasks");

    tasksRoute.get(async function (req, res) {
        try {
            let query = Task.find();
            if (req.query.where) {
                try {
                    const whereFilter = JSON.parse(req.query.where);
                    query = query.where(whereFilter);
                } catch (err) {
                    return res.status(400).json({
                        message: "Where query failed",
                        data: {}
                    });
                }
            }
            if (req.query.sort) {
                try {
                    const sortFilter = JSON.parse(req.query.sort);
                    query = query.sort(sortFilter);
                } catch (err) {
                    return res.status(400).json({
                        message: "Sort query failed",
                        data: {}
                    });
                }
            }
            if (req.query.select) {
                try {
                    const selectFilter = JSON.parse(req.query.select);
                    query = query.select(selectFilter);
                } catch (err) {
                    return res.status(400).json({
                        message: "Select query failed",
                        data: {}
                    });
                }
            }
            if (req.query.skip) {
                const skipFilter = parseInt(req.query.skip);
                if (!isNaN(skipFilter)) {
                    query = query.skip(skipFilter);
                } else {
                    return res.status(400).json({
                        message: "Skip query failed",
                        data: {}
                    });
                }
            }
            let limitFilter = 100;
            if (req.query.limit) {
                limitFilter = parseInt(req.query.limit);
            }
            if (!isNaN(limitFilter)) {
                query = query.limit(limitFilter);
            } else {
                return res.status(400).json({
                    message: "Limit query failed",
                    data: {}
                });
            }

            if (req.query.count === "true") {
                const count = await Task.countDocuments(query.getFilter());
                return res.status(200).json({
                    message: "Count Returned",
                    data: count
                });
            }

            const tasks = await query.exec();

            return res.status(200).json({
                message: "Tasks Returned",
                data: tasks
            })
        } catch (err) {
                return res.status(500).json({
                    message: "Error trying to get tasks",
                    data: {}
                })
        }
    });

    tasksRoute.post(async function(req, res) {
        try {
            if (!req.body.name || !req.body.deadline) {
                return res.status(400).json({
                    message: "Name and deadline are required",
                    data: {}
                });
            }

            let defaultName = "unassigned";
            if (req.body.assignedUser && req.body.assignedUser !== "") {
                const user = await User.findById(req.body.assignedUser);
                if (!user) {
                    return res.status(400).json({
                        message: "User not in DB",
                        data: {}
                    })
                }
                defaultName = user.name;
            }

            const task = new Task({
                name: req.body.name,
                description: req.body.description || "No description",
                deadline: req.body.deadline,
                completed: req.body.completed || false,
                assignedUser: req.body.assignedUser || "",
                assignedUserName: defaultName
            });

            const savedTask = await task.save();

            if (savedTask.assignedUser && savedTask.assignedUser !== "" && savedTask.completed === false) {
                // Needs to be added to this user's pending tasks list
                const updated = await User.findByIdAndUpdate(
                    task.assignedUser,
                    {$addToSet: {pendingTasks: savedTask._id.toString()}}
                )
            }

            return res.status(201).json({
                message: "Task created",
                data: savedTask
            });
        } catch (err) {
            return res.status(500).json({
                message: "Error creating task",
                data: {}
            });
        }
    })

    var taskIDRoute = router.route("/tasks/:id");

    taskIDRoute.get(async function (req, res) {
        try {
            let query = Task.findById(req.params.id);

            if (req.query.select) {
                try {
                    const selectFilter = JSON.parse(req.query.select);
                    query = query.select(selectFilter);
                } catch (err) {
                    return res.status(400).json({
                        message: "Select Query Failed",
                        data: {}
                    });
                }
            }

            const task = await query.exec();
            if (!task) {
                return res.status(404).json({
                    message: "Task doesn't exist in DB",
                    data: {}
                });
            }

            return res.status(200).json({
                message: "Returning task",
                data: task
            });
        } catch (err) {
            return res.status(500).json({
                message: "Error getting task",
                data: {}
            });
        }
    })

    taskIDRoute.put(async function(req, res) {
        try {
            if (!req.body.name || !req.body.deadline) {
                return res.status(400).json({
                    message: "Name and deadline are required",
                    data: {}
                });
            }

            const originalTask = await Task.findById(req.params.id);

            if (!originalTask) {
                return res.status(400).json({
                    message: "Task not in DB",
                    data: {}
                });
            }

            let defaultName = "unassigned";
            if (req.body.assignedUser && req.body.assignedUser !== "") {
                const user = await User.findById(req.body.assignedUser);
                if (!user) {
                    return res.status(400).json({
                        message: "User not in DB",
                        data: {}
                    })
                }
                defaultName = user.name;
            }

            const updated = await Task.findByIdAndUpdate(
                req.params.id,
                {
                    name: req.body.name,
                    description: req.body.description || "", 
                    deadline: req.body.deadline,
                    completed: req.body.completed || false,
                    assignedUser: req.body.assignedUser || "",
                    assignedUserName: defaultName,
                },
                {
                    runValidators: true,
                    new: true
                },

            )

            if (!updated) {
                return res.status(404).json({
                    message: "Task doesn't exist in DB",
                    data: {}
                });
            }

            // Check for differences between original task and updated task
            // if task was originally unasigned and now it has been assigned then add it to the user
            // if the task was originally assigned and now it has been unassigned then remove it from the user
            // if the assigned user has changed remove it from the original and add it to the new one
            // if the task was originally marked as incomplete but now it is complete then remove it
            // if the task was originally complte but is now incomplete then add it to the tasks

            if (originalTask.assignedUser !== updated.assignedUser) {
                // does it need to be removed from anyones list (unassigned / reassigned)
                if (originalTask.assignedUser && originalTask.assignedUser !== "" && originalTask.completed === false) {
                    await User.findByIdAndUpdate(originalTask.assignedUser, {$pull: {pendingTasks: req.params.id}});
                }
                // does it need to be added to anyones list (assigned / reassigned)
                if (updated.assignedUser && updated.assignedUser !== "" && updated.completed === false) {
                    await User.findByIdAndUpdate(updated.assignedUser, {$addToSet: {pendingTasks: updated._id.toString()}});
                }
            } else if (originalTask.completed !== updated.completed) {
                // The person doesn't change
                // does it need to be removed from the person?
                if (originalTask.completed === false && originalTask.assignedUser && originalTask.assignedUser !== "") {
                    // it was in the persons list and needs to be removed
                    await User.findByIdAndUpdate(originalTask.assignedUser, {$pull: {pendingTasks: req.params.id}});
                }
                // does it need to be added to the person
                if (updated.completed === false && updated.assignedUser && updated.assignedUser !== "") {
                    // it has been made incomplete and needs to be added
                    await User.findByIdAndUpdate(updated.assignedUser, {$addToSet: {pendingTasks: updated._id.toString()}});
                }
            }

            return res.status(200).json({
                message: "Change made",
                data: updated
            });
        } catch (err) {
            return res.status(500).json({
                message: "Error updating task",
                data: {}
            });
        }
    });

    taskIDRoute.delete(async function (req, res) {
        try {
            const deleted = await Task.findByIdAndDelete(req.params.id);
            if (!deleted) {
                return res.status(404).json({
                    message: "Task doesn't exist in DB",
                    data: {}
                });
            }
            if (deleted.assignedUser && deleted.assignedUser !== "") {
                await User.findByIdAndUpdate(deleted.assignedUser, {$pull: {pendingTasks: req.params.id}})
            }

            return res.status(200).json({
                message: "Delted",
                data: deleted
            });
        } catch (err) {
            return res.status(500).json({
                message: "Error deleting task",
                data: {}
            });
        }
    });

    return router;
}