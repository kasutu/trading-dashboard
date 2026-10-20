# Admin commands inside the api container (Railway: railway ssh --service api).
# Examples: make users | make owner NAME=kasutu | make plan NAME=alice PLAN=espresso
#           make delete NAME=alice   (deletes the user and all their data, cannot be undone)

.PHONY: help users plan owner delete
help:
	@api help

users:
	@api users

plan:
	@test -n "$(NAME)" -a -n "$(PLAN)" || { echo "Usage: make plan NAME=<username> PLAN=<free|espresso|latte|owner>"; exit 1; }
	@api plan "$(NAME)" "$(PLAN)"

owner:
	@test -n "$(NAME)" || { echo "Usage: make owner NAME=<username>"; exit 1; }
	@api owner "$(NAME)"

delete:
	@test -n "$(NAME)" || { echo "Usage: make delete NAME=<username>"; exit 1; }
	@api delete "$(NAME)"
