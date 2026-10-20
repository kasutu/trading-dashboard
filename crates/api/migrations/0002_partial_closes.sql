-- A partial close is a separate row with the same ticket (for example 0.02 and 0.03 lots
-- of a 0.05 position). Identify a trade by ticket plus close time, lots and close price,
-- so partial closes are kept and re-importing the same file still finds duplicates.
alter table trades drop constraint trades_pkey;
alter table trades add primary key (account_id, ticket, closed_at, lots, close_price);
