-- Broker adjustment notes from MT5 imports: "(broker) · D-NULL" becomes "(broker): D-NULL", the format new imports use.
update cash_flows set note = replace(note, '(broker) · ', '(broker): ')
  where note like '%(broker) · %';
