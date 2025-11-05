var User = require("../models/user");
var Task = require("../models/task");

module.exports = function (router) {

    var usersRoute = router.route("/users");

    usersRoute.get(async function (req, res) {
        try {
            let query = User.find();
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
            if (req.query.limit) {
                const limitFilter = parseInt(req.query.limit);
                if (!isNaN(limitFilter)) {
                    query = query.limit(limitFilter);
                } else {
                    return res.status(400).json({
                        message: "Limit query failed",
                        data: {}
                    });
                }
            }
            if (req.query.count === "true") {
                const count = await User.countDocuments(query.getFilter());
                return res.status(200).json({
                    message: "Count Returned",
                    data: count
                });
            }

            const users = await query.exec();

            return res.status(200).json({
                message: "Users Returned",
                data: users
            })
        } catch (err) {
                return res.status(500).json({
                    message: "Error trying to get users",
                    data: {}
                })
        }
    });

    usersRoute.post(async function(req, res) {
        try {
            if (!req.body.name || !req.body.email) {
                return res.status(400).json({
                    message: "Name and email are required",
                    data: {}
                });
            }

            const user = new User({
                name: req.body.name,
                email: req.body.email,
                pendingTasks: req.body.pendingTasks || []
            });

            const savedUser = await user.save();

            if (savedUser.pendingTasks && savedUser.pendingTasks.length > 0) {
                await Task.updateMany(
                    { _id: { $in: savedUser.pendingTasks } },
                    { 
                        assignedUser: savedUser._id.toString(),
                        assignedUserName: savedUser.name,
                        completed: false
                    }
                );
            }

            return res.status(201).json({
                message: "User created",
                data: savedUser
            });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({
                    message: "Duplicate Email",
                    data: {}
                });
            }
            return res.status(500).json({
                message: "Error creating user",
                data: {}
            });
        }
    })

    var userIDRoute = router.route("/users/:id");

    userIDRoute.get(async function (req, res) {
        try {
            let query = User.findById(req.params.id);

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

            const user = await query.exec();
            if (!user) {
                return res.status(404).json({
                    message: "User doesn't exist in DB",
                    data: {}
                });
            }

            return res.status(200).json({
                message: "Returning Users",
                data: user
            });
        } catch (err) {
            return res.status(500).json({
                message: "Error getting user",
                data: {}
            });
        }
    })

    userIDRoute.put(async function(req, res) {
        try {
            if (!req.body.name || !req.body.email) {
                return res.status(400).json({
                    message: "Name and email are required",
                    data: {}
                });
            }

            const oldUser = await User.findById(req.params.id);
            if (!oldUser) {
                return res.status(404).json({
                    message: "User ID not in DB",
                    data: {}
                });
            }

            const updated = await User.findByIdAndUpdate(
                req.params.id,
                {
                    name: req.body.name,
                    email: req.body.email,
                    pendingTasks: req.body.pendingTasks || [] 
                },
                {
                    runValidators: true,
                    new: true
                },

            )

            if (!updated) {
                return res.status(404).json({
                    message: "User doesn't exist in DB",
                    data: {}
                });
            }

            // TO fix 2 way stuff, we first need to see what tasks were removed from og list to be unassigned. 
            // Unassigned tasks will have to be removed from person assignmend
            // Then can check what was added to og list to assign to person (defaulting to incomplete cause been added to pending)
            // Then if the name of the person was updated go through all their tasks and update the name

            const oldTasks = oldUser.pendingTasks;
            const newTasks = updated.pendingTasks;

            const removedTasks = oldTasks.filter(taskId => !newTasks.includes(taskId));
            const addedTasks = newTasks.filter(taskId => !oldTasks.includes(taskId));

            if (removedTasks.length > 0) {
                await Task.updateMany(
                    { _id: { $in: removedTasks } },
                    {assignedUser: "", assignedUserName: "unassigned"}
                );
            }

            if (addedTasks.length > 0) {
                await Task.updateMany(
                    { _id: { $in: addedTasks } },
                    { 
                        assignedUser: updated._id.toString(),
                        assignedUserName: updated.name,
                        completed: false
                    }
                );
            }

            if (oldUser.name !== updated.name) {
                await Task.updateMany(
                    { assignedUser:  req.params.id },
                    { assignedUserName: updated.name }
                );
            }

            return res.status(200).json({
                message: "Change made",
                data: updated
            });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({
                    message: "Duplicate Email",
                    data: {}
                });
            }
            return res.status(500).json({
                message: "Error updating user",
                data: {}
            });
        }
    });

    userIDRoute.delete(async function (req, res) {
        try {
            const deleted = await User.findByIdAndDelete(req.params.id);
            if (!deleted) {
                return res.status(404).json({
                    message: "User doesn't exist in DB",
                    data: {}
                });
            }

            await Task.updateMany(
                { assignedUser: req.params.id },
                { assignedUser: "", assignedUserName: "unassigned" }
            );

            return res.status(200).json({
                message: "Delted",
                data: deleted
            });
        } catch (err) {
            return res.status(500).json({
                message: "Error deleting user",
                data: {}
            });
        }
    });

    return router;
}