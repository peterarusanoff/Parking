#!/bin/bash
# start-stripe-listener.sh

# Start stripe listen in background and capture output
stripe listen --forward-to localhost:3000/api/webhooks/stripe 2>&1 | while IFS= read -r line; do
    echo "$line"
    
    # Extract webhook secret from the output
    if [[ $line =~ whsec_[a-zA-Z0-9]+ ]]; then
        secret="${BASH_REMATCH[0]}"
        
        # Check if .env exists and has STRIPE_WEBHOOK_SECRET
        if [ -f .env ]; then
            if grep -q "STRIPE_WEBHOOK_SECRET=" .env; then
                # Update existing entry
                sed -i '' "s|STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$secret|" .env
                echo "✅ Updated STRIPE_WEBHOOK_SECRET in .env"
            else
                # Append new entry
                echo "STRIPE_WEBHOOK_SECRET=$secret" >> .env
                echo "✅ Added STRIPE_WEBHOOK_SECRET to .env"
            fi
        else
            # Create new .env file
            echo "STRIPE_WEBHOOK_SECRET=$secret" > .env
            echo "✅ Created .env with STRIPE_WEBHOOK_SECRET"
        fi
    fi
done